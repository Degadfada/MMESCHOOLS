// mmenyene/controllers/ShareController.js — DOCX/PDF exports for the Share button,
// plus short-lived links for devices that cannot share files directly.
import crypto from 'node:crypto';
import { Controller } from '../../mme/http/Controller.js';
import { HttpError } from '../../mme/http/Request.js';

const LINK_TTL = 24 * 3600 * 1000;

export class ShareController extends Controller {
  constructor(app) { super(app); this.links = new Map(); }

  routes() {
    return [
      ['GET', '/api/export/note/:id', 'note'],
      ['GET', '/api/export/test/:id', 'test'],
      ['GET', '/api/export/results/:id', 'results'],
      ['POST', '/api/export/questions', 'questions'],
      ['POST', '/api/share/link', 'link'],
      ['GET', '/s/:token', 'download', { auth: 'public' }]
    ];
  }

  send(res, file, inline) { res.file(file.buffer, { type: file.mime, filename: file.filename, inline }); }
  fmt(req) { return req.query.fmt === 'docx' ? 'docx' : 'pdf'; }

  build(teacher, kind, id, params = {}) {
    const fmt = params.fmt === 'docx' ? 'docx' : 'pdf';
    const ex = this.app.exporter;
    if (kind === 'note') return ex.note(teacher, id, fmt, { withPhotos: params.photos !== '0' });
    if (kind === 'test') return ex.test(teacher, id, fmt, { variant: params.variant || 'paper', version: params.version || 'A' });
    if (kind === 'results') return ex.results(teacher, id, fmt);
    throw new HttpError(400, 'unknown export');
  }

  note(req, res) { this.send(res, this.build(req.teacher, 'note', req.params.id, req.query)); }
  test(req, res) { this.send(res, this.build(req.teacher, 'test', req.params.id, req.query)); }
  results(req, res) { this.send(res, this.build(req.teacher, 'results', req.params.id, req.query)); }

  async questions(req, res) {
    const body = await req.json();
    this.send(res, this.app.exporter.questions(req.teacher, body, body.fmt === 'docx' ? 'docx' : 'pdf'));
  }

  /** A link anyone can open for 24 hours — for "copy link" / WhatsApp text fallbacks. */
  async link(req) {
    const { kind, id, params } = await req.json();
    const file = this.build(req.teacher, kind, id, params || {});      // build now: checks access, fails early
    const token = crypto.randomBytes(12).toString('base64url');
    this.links.set(token, { file, expires: Date.now() + LINK_TTL });
    for (const [k, v] of this.links) if (v.expires < Date.now()) this.links.delete(k);
    return { path: '/s/' + token, filename: file.filename, expires: Date.now() + LINK_TTL };
  }

  download(req, res) {
    const l = this.links.get(req.params.token);
    if (!l || l.expires < Date.now()) throw new HttpError(404, 'this link has expired — ask your teacher to share it again');
    this.send(res, l.file, true);
  }
}
