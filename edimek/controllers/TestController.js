// edimek/controllers/TestController.js — the teacher's test controls and Live Watch feed.
import { Controller } from '../../mme/http/Controller.js';

export class TestController extends Controller {
  routes() {
    return [
      ['GET', '/api/tests', 'list'],
      ['POST', '/api/tests', 'create'],
      ['GET', '/api/tests/:id', 'get'],
      ['PUT', '/api/tests/:id', 'update'],
      ['DELETE', '/api/tests/:id', 'remove'],
      ['POST', '/api/tests/:id/open', 'open'],
      ['POST', '/api/tests/:id/close', 'close'],
      ['POST', '/api/tests/:id/release', 'release'],
      ['POST', '/api/tests/:id/reopen', 'reopen'],
      ['POST', '/api/tests/:id/extend', 'extend'],
      ['POST', '/api/tests/:id/students/:aid/rename', 'rename'],
      ['POST', '/api/tests/:id/students/:aid/remove', 'removeStudent'],
      ['GET', '/api/tests/:id/live', 'live'],
      ['GET', '/api/tests/:id/stream', 'stream'],
      ['GET', '/api/tests/:id/csv', 'csv']
    ];
  }

  get ts() { return this.app.tests; }

  list(req) { return this.ts.list(req.teacher); }
  async create(req) { return this.ts.create(req.teacher, await req.json()); }
  get(req) { return this.ts.view(req.teacher, req.params.id); }
  async update(req) { return this.ts.update(req.teacher, req.params.id, await req.json()); }
  remove(req) { this.ts.delete(req.teacher, req.params.id); return { ok: true }; }
  open(req) { return this.ts.open(req.teacher, req.params.id); }
  close(req) { return this.ts.close(req.teacher, req.params.id); }
  release(req) { return this.ts.release(req.teacher, req.params.id); }
  reopen(req) { return this.ts.reopen(req.teacher, req.params.id); }
  async extend(req) { return this.ts.extend(req.teacher, req.params.id, await req.json()); }
  async rename(req) { return this.ts.renameStudent(req.teacher, req.params.id, req.params.aid, (await req.json()).name); }
  removeStudent(req) { return this.ts.removeStudent(req.teacher, req.params.id, req.params.aid); }
  live(req) { return this.ts.results(req.teacher, req.params.id); }

  stream(req, res) {
    const t = this.ts.own(req.teacher, req.params.id);
    this.app.live.channel(t.id).attach(req.raw, res.raw);
  }

  csv(req, res) {
    const { filename, text } = this.ts.csv(req.teacher, req.params.id);
    res.file(Buffer.from('﻿' + text, 'utf8'), { type: 'text/csv; charset=utf-8', filename });
  }
}
