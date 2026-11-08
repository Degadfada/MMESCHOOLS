// mmenyene/controllers/ForgeController.js — Spin, re-spin, reject; and the question bank.
import { Controller } from '../../mme/http/Controller.js';

export class ForgeController extends Controller {
  routes() {
    return [
      ['GET', '/api/forge/templates', 'templates'],
      ['POST', '/api/forge/spin', 'spin'],
      ['POST', '/api/forge/respin', 'respin'],
      ['POST', '/api/forge/reject', 'reject'],
      ['GET', '/api/teachings/:id/bank', 'bank'],
      ['POST', '/api/teachings/:id/bank', 'save'],
      ['PUT', '/api/bank/:id', 'updateQuestion'],
      ['DELETE', '/api/bank/:id', 'removeQuestion']
    ];
  }

  templates() { return this.app.forge.catalogue(); }
  async spin(req) { return this.app.forge.spin(req.teacher, await req.json()); }
  async respin(req) { return this.app.forge.respin(req.teacher, await req.json()); }
  async reject(req) { this.app.forge.reject(req.teacher, (await req.json()).fingerprint); return { ok: true }; }
  bank(req) { return this.app.bank.list(req.teacher, req.params.id); }
  async save(req) { return this.app.bank.save(req.teacher, req.params.id, (await req.json()).questions || []); }
  async updateQuestion(req) { return this.app.bank.update(req.teacher, req.params.id, await req.json()); }
  removeQuestion(req) { this.app.bank.remove(req.teacher, req.params.id); return { ok: true }; }
}
