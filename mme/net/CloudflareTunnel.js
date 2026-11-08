// mme/net/CloudflareTunnel.js — the built-in public link.
//
// Runs cloudflared as a "quick tunnel" to the local server and announces the public
// https URL. Restarts with back-off if the tunnel drops. If the binary is missing it
// fetches Cloudflare's own release once into ./bin (this is the only download the
// app ever makes on its own, and it is the official binary, not a package).
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

const RELEASES = {
  'win32-x64': 'cloudflared-windows-amd64.exe',
  'win32-ia32': 'cloudflared-windows-386.exe',
  'linux-x64': 'cloudflared-linux-amd64',
  'linux-arm64': 'cloudflared-linux-arm64',
  'linux-arm': 'cloudflared-linux-arm',
  'darwin-x64': 'cloudflared-darwin-amd64.tgz',
  'darwin-arm64': 'cloudflared-darwin-amd64.tgz'
};
// Match the multi-word tunnel host only, so cloudflared's own api.trycloudflare.com
// chatter does not count as "the link".
const URL_RE = /https:\/\/[a-z0-9]+(?:-[a-z0-9]+)+\.trycloudflare\.com/;

export class CloudflareTunnel extends EventEmitter {
  constructor({ port, binDir, log = console } = {}) {
    super();
    this.port = port;
    this.binDir = binDir;
    this.log = log;
    this.url = null;
    this.status = 'stopped';     // stopped | starting | up | down | unavailable
    this.proc = null;
    this.restarts = 0;
    this.stopping = false;
  }

  get binary() {
    const name = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
    return path.join(this.binDir, name);
  }

  info() { return { url: this.url, status: this.status, restarts: this.restarts }; }

  async ensureBinary() {
    if (fs.existsSync(this.binary)) return this.binary;
    const asset = RELEASES[`${process.platform}-${process.arch}`];
    if (!asset || asset.endsWith('.tgz')) throw new Error('no cloudflared binary for this platform; place one in ' + this.binDir);
    fs.mkdirSync(this.binDir, { recursive: true });
    const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/${asset}`;
    this.log.log('  downloading cloudflared (one time)…');
    await download(url, this.binary + '.part');
    fs.renameSync(this.binary + '.part', this.binary);
    if (process.platform !== 'win32') fs.chmodSync(this.binary, 0o755);
    return this.binary;
  }

  async start() {
    this.stopping = false;
    try { await this.ensureBinary(); }
    catch (e) { this._set('unavailable'); this.emit('error', e); return; }
    this._spawn();
  }

  _spawn() {
    this._set('starting');
    const proc = spawn(this.binary, ['tunnel', '--url', `http://localhost:${this.port}`, '--no-autoupdate'], { windowsHide: true });
    this.proc = proc;
    const scan = (buf) => {
      const m = buf.toString().match(URL_RE);
      if (m && m[0] !== this.url) { this.url = m[0]; this._set('up'); this.emit('url', this.url); }
    };
    proc.stdout.on('data', scan);
    proc.stderr.on('data', scan);
    proc.on('exit', (code) => {
      if (this.proc !== proc) return;
      this.proc = null; this.url = null;
      if (this.stopping) return this._set('stopped');
      this._set('down');
      const wait = Math.min(60_000, 2000 * 2 ** Math.min(this.restarts, 5));
      this.restarts++;
      this.log.log(`  [tunnel] exited (${code}); retrying in ${Math.round(wait / 1000)}s`);
      setTimeout(() => { if (!this.stopping) this._spawn(); }, wait);
    });
  }

  _set(status) { this.status = status; this.emit('status', this.info()); }

  stop() {
    this.stopping = true;
    if (this.proc) { try { this.proc.kill(); } catch { /* gone */ } }
  }
}

function download(url, to, hops = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'mmeschools' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 5) {
        res.resume(); return resolve(download(res.headers.location, to, hops + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('download failed: HTTP ' + res.statusCode)); }
      const out = fs.createWriteStream(to);
      res.pipe(out);
      out.on('finish', () => out.close(resolve));
      out.on('error', reject);
    }).on('error', reject);
  });
}
