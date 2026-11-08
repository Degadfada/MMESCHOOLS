// mme/http/Response.js — helpers for writing responses consistently.

export class Response {
  constructor(raw) { this.raw = raw; this.cookies = []; }

  get sent() { return this.raw.headersSent || this.raw.writableEnded; }

  setCookie(name, value, { maxAge, httpOnly = true, secure = false, sameSite = 'Lax', path = '/' } = {}) {
    let c = `${name}=${encodeURIComponent(value)}; Path=${path}; SameSite=${sameSite}`;
    if (maxAge !== undefined) c += `; Max-Age=${maxAge}`;
    if (httpOnly) c += '; HttpOnly';
    if (secure) c += '; Secure';
    this.cookies.push(c);
    return this;
  }

  _head(status, headers) {
    if (this.cookies.length) headers['Set-Cookie'] = this.cookies;
    this.raw.writeHead(status, headers);
  }

  json(status, body) {
    if (this.sent) return;
    this._head(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    this.raw.end(JSON.stringify(body));
  }

  send(status, body, type = 'text/plain; charset=utf-8', extra = {}) {
    if (this.sent) return;
    this._head(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra });
    this.raw.end(body);
  }

  file(buf, { type, filename, inline = false }) {
    const disp = `${inline ? 'inline' : 'attachment'}; filename="${filename.replace(/"/g, '')}"`;
    this.send(200, buf, type, { 'Content-Disposition': disp, 'Content-Length': buf.length });
  }

  redirect(location) {
    if (this.sent) return;
    this._head(302, { Location: location });
    this.raw.end();
  }
}
