// mme/http/Request.js — a thin wrapper over node's IncomingMessage: parsed URL,
// query, cookies, route params and a lazily-read body.

export class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}

export class Request {
  constructor(raw, { maxBody = 25 * 1024 * 1024 } = {}) {
    this.raw = raw;
    this.method = raw.method;
    const url = new URL(raw.url, 'http://local');
    this.path = decodeURIComponent(url.pathname);
    this.query = Object.fromEntries(url.searchParams);
    this.params = {};
    this.maxBody = maxBody;
    this.cookies = Request.parseCookies(raw.headers.cookie || '');
    this.teacher = null;          // set by the auth guard
    this._body = undefined;
  }

  static parseCookies(header) {
    const out = {};
    for (const part of header.split(';')) {
      const i = part.indexOf('=');
      if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    }
    return out;
  }

  header(name) { return this.raw.headers[name.toLowerCase()]; }
  get ip() { return this.header('cf-connecting-ip') || this.raw.socket.remoteAddress || ''; }
  get isSecure() { return this.header('x-forwarded-proto') === 'https' || !!this.header('cf-ray'); }

  buffer() {
    if (this._buf) return this._buf;
    this._buf = new Promise((resolve, reject) => {
      const chunks = []; let size = 0;
      this.raw.on('data', (c) => {
        size += c.length;
        if (size > this.maxBody) { reject(new HttpError(413, 'request too large')); this.raw.destroy(); return; }
        chunks.push(c);
      });
      this.raw.on('end', () => resolve(Buffer.concat(chunks)));
      this.raw.on('error', reject);
    });
    return this._buf;
  }

  async json() {
    if (this._body !== undefined) return this._body;
    const buf = await this.buffer();
    if (!buf.length) return (this._body = {});
    try { this._body = JSON.parse(buf.toString('utf8')); }
    catch { throw new HttpError(400, 'body is not valid JSON'); }
    return this._body;
  }
}
