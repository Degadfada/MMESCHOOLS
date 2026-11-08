// mmenyene/controllers/NotebookController.js — classes, notes, versions, search, import.
import { Controller } from '../../mme/http/Controller.js';

export class NotebookController extends Controller {
  routes() {
    return [
      ['GET', '/api/teachings', 'teachings'],
      ['POST', '/api/teachings', 'addTeaching'],
      ['DELETE', '/api/teachings/:id', 'removeTeaching'],
      ['GET', '/api/options', 'options'],
      ['GET', '/api/teachings/:id/notes', 'notes'],
      ['POST', '/api/notes', 'create'],
      ['POST', '/api/notes/import-docx', 'importDocx'],
      ['GET', '/api/notes/:id', 'get'],
      ['PUT', '/api/notes/:id', 'update'],
      ['DELETE', '/api/notes/:id', 'remove'],
      ['GET', '/api/notes/:id/versions', 'versions'],
      ['POST', '/api/notes/:id/restore', 'restore'],
      ['POST', '/api/notes/:id/copy', 'copy'],
      ['GET', '/api/search', 'search']
    ];
  }

  get nb() { return this.app.notebook; }

  teachings(req) { return this.nb.listTeachings(req.teacher); }
  async addTeaching(req) { return this.nb.addTeaching(req.teacher, await req.json()); }
  removeTeaching(req) { this.nb.removeTeaching(req.teacher, req.params.id); return { ok: true }; }
  options(req) { return this.nb.orgOptions(req.teacher); }
  notes(req) { return this.nb.listNotes(req.teacher, req.params.id); }
  async create(req) { return this.nb.createNote(req.teacher, await req.json()); }
  async importDocx(req) { return this.nb.importDocx(req.teacher, await req.json()); }
  get(req) { return this.nb.note(req.teacher, req.params.id); }
  async update(req) { return this.nb.updateNote(req.teacher, req.params.id, await req.json()); }
  remove(req) { this.nb.deleteNote(req.teacher, req.params.id); return { ok: true }; }
  versions(req) { return this.nb.versions(req.teacher, req.params.id); }
  async restore(req) { return this.nb.restore(req.teacher, req.params.id, (await req.json()).versionId); }
  async copy(req) { return this.nb.copyShared(req.teacher, req.params.id, (await req.json()).teachingId); }
  search(req) { return this.nb.search(req.teacher, req.query.q || ''); }
}
