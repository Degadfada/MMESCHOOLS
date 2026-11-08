// mme/http/Server.js — the HTTP front door: rate limit → router → controller, or
// static files, with every thrown HttpError turned into a clean JSON error.
import http from 'node:http';
import { Router } from './Router.js';
import { Request, HttpError } from './Request.js';
import { Response } from './Response.js';
import { StaticFiles } from './StaticFiles.js';

class RateLimiter {
  constructor({ windowMs = 10_000, max = 300 } = {}) { this.windowMs = windowMs; this.max = max; this.hits = new Map(); }
  allow(key) {
    const now = Date.now();
    let h = this.hits.get(key);
    if (!h || now - h.start > this.windowMs) { h = { start: now, n: 0 }; this.hits.set(key, h); }
    if (this.hits.size > 5000) for (const [k, v] of this.hits) if (now - v.start > this.windowMs) this.hits.delete(k);
    return ++h.n <= this.max;
  }
}

export class Server {
  constructor({ port = 5080, log = console } = {}) {
    this.port = port;
    this.log = log;
    this.router = new Router();
    this.static = new StaticFiles();
    this.pages = new Map();          // exact path or prefix -> html file (SPA entry points)
    this.middleware = [];            // async (req, res) => void, run before handlers
    // Per device (cookie), not just per IP: a whole class on one school Wi-Fi or one
    // hotspot reaches the tunnel from a single public IP.
    this.limiter = new RateLimiter({ windowMs: 10_000, max: 200 });
    this.ipLimiter = new RateLimiter({ windowMs: 10_000, max: 6000 });
    this.http = http.createServer((a, b) => this._handle(a, b));
  }

  use(fn) { this.middleware.push(fn); return this; }
  page(prefix, file) { this.pages.set(prefix, file); return this; }

  async _handle(rawReq, rawRes) {
    const req = new Request(rawReq);
    const res = new Response(rawRes);
    try {
      const who = req.cookies.mme_dev || req.cookies.mme_sid || '';
      if (!this.ipLimiter.allow(req.ip) || !this.limiter.allow(req.ip + '|' + who)) throw new HttpError(429, 'too many requests — wait a moment');
      const hit = this.router.match(req.method, req.path);
      if (hit && hit.route) {
        req.params = hit.params;
        for (const mw of this.middleware) await mw(req, res, hit.route.opts);
        const out = await hit.route.handler(req, res);
        if (!res.sent) res.json(200, out === undefined ? { ok: true } : out);
        return;
      }
      if (hit && hit.methodNotAllowed) throw new HttpError(405, 'method not allowed');
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(404, 'no such endpoint');

      const file = this.static.resolve(req.path);
      if (file) return this.static.serve(rawRes, file);
      for (const [prefix, html] of this.pages) {
        if (req.path === prefix || (prefix.endsWith('/') && req.path.startsWith(prefix))) return this.static.serve(rawRes, html);
      }
      throw new HttpError(404, 'not found');
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) this.log.error('[http]', req.method, req.path, err);
      if (req.path.startsWith('/api/') || req.method !== 'GET') res.json(status, { error: err.message, ...(err.extra || {}) });
      else res.send(status, status === 404 ? 'Not found' : 'Something went wrong');
    }
  }

  listen() {
    return new Promise((resolve) => this.http.listen(this.port, () => resolve(this)));
  }
  close() { return new Promise((r) => this.http.close(() => r())); }
}
