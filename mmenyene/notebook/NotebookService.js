// mmenyene/notebook/NotebookService.js — teachings (subject × class) and their notes.
import { HttpError } from '../../mme/http/Request.js';

export class NotebookService {
  constructor({ subjects, classrooms, teachings, notes, docx }) {
    Object.assign(this, { subjects, classrooms, teachings, notes, docx });
  }

  // ── teachings ──────────────────────────────────────────────────────────
  listTeachings(teacher) { return this.teachings.forTeacher(teacher.id); }

  addTeaching(teacher, { subject, className }) {
    if (!subject || !className) throw new HttpError(400, 'subject and class are both needed');
    const s = this.subjects.ensure(teacher.org_id, subject);
    const c = this.classrooms.ensure(teacher.org_id, className);
    return this.teachings.full(this.teachings.ensure(teacher.id, s.id, c.id).id);
  }

  /** A teaching the teacher owns, or a 404/403. */
  teaching(teacher, id) {
    const t = this.teachings.full(Number(id));
    if (!t) throw new HttpError(404, 'class not found');
    if (t.teacher_id !== teacher.id) throw new HttpError(403, 'that class belongs to another teacher');
    return t;
  }

  removeTeaching(teacher, id) {
    const t = this.teaching(teacher, id);
    this.teachings.delete(t.id);
  }

  orgOptions(teacher) {
    return {
      subjects: this.subjects.where({ org_id: teacher.org_id }, { order: 'name' }).map(s => s.name),
      classes: this.classrooms.where({ org_id: teacher.org_id }, { order: 'name' }).map(c => c.name)
    };
  }

  // ── notes ──────────────────────────────────────────────────────────────
  listNotes(teacher, teachingId) {
    const t = this.teaching(teacher, teachingId);
    return { teaching: t, notes: this.notes.forTeaching(t.id), shared: this.notes.sharedForSubject(teacher.org_id, t.subject_id, teacher.id) };
  }

  /** Readable: own notes, or a colleague's note that is shared within the org. */
  note(teacher, id, { write = false } = {}) {
    const n = this.notes.find(Number(id));
    if (!n) throw new HttpError(404, 'note not found');
    if (n.teacher_id === teacher.id) return n;
    if (write) throw new HttpError(403, 'only the author can change this note');
    const t = this.teachings.full(n.teaching_id);
    const ownerOrg = this.notes.db.get('SELECT org_id FROM teachers WHERE id = ?', n.teacher_id).org_id;
    if (!n.shared || ownerOrg !== teacher.org_id) throw new HttpError(403, 'that note is private');
    return { ...n, teacher_name: t.teacher_name, readonly: true };
  }

  createNote(teacher, { teachingId, title, topic, body, source = 'typed' }) {
    const t = this.teaching(teacher, teachingId);
    const clean = String(body || '').replace(/\r\n?/g, '\n');
    const note = this.notes.insert({
      teaching_id: t.id, teacher_id: teacher.id,
      title: String(title || NotebookService.guessTitle(clean)).trim().slice(0, 140) || 'Untitled note',
      topic: String(topic || '').trim().slice(0, 100), body: clean, source
    });
    this.notes.saveVersion(note);
    return note;
  }

  updateNote(teacher, id, patch) {
    const n = this.note(teacher, id, { write: true });
    const next = this.notes.update(n.id, {
      title: patch.title !== undefined ? String(patch.title).trim().slice(0, 140) : undefined,
      topic: patch.topic !== undefined ? String(patch.topic).trim().slice(0, 100) : undefined,
      body: patch.body !== undefined ? String(patch.body).replace(/\r\n?/g, '\n') : undefined,
      shared: patch.shared !== undefined ? !!patch.shared : undefined
    });
    if (patch.body !== undefined && patch.body !== n.body) this.notes.saveVersion(next);
    return next;
  }

  deleteNote(teacher, id) { this.notes.delete(this.note(teacher, id, { write: true }).id); }

  copyShared(teacher, noteId, teachingId) {
    const src = this.note(teacher, noteId);
    return this.createNote(teacher, { teachingId, title: src.title, topic: src.topic, body: src.body, source: 'shared' });
  }

  versions(teacher, id) { return this.notes.versions(this.note(teacher, id).id); }
  restore(teacher, id, versionId) {
    const n = this.note(teacher, id, { write: true });
    const v = this.notes.version(n.id, Number(versionId));
    if (!v) throw new HttpError(404, 'version not found');
    return this.updateNote(teacher, id, { title: v.title, body: v.body });
  }

  search(teacher, q) { return q && q.trim().length >= 2 ? this.notes.search(teacher.id, q.trim()) : []; }

  importDocx(teacher, { teachingId, filename, base64, topic }) {
    if (!base64) throw new HttpError(400, 'no file');
    let text;
    try { text = this.docx.toNoteText(Buffer.from(base64, 'base64')); }
    catch { throw new HttpError(400, 'that file is not a readable .docx'); }
    const title = String(filename || 'Imported notes').replace(/\.docx$/i, '');
    return this.createNote(teacher, { teachingId, title, topic, body: text, source: 'docx' });
  }

  static guessTitle(body) {
    const first = body.split('\n').map(l => l.replace(/^#+\s*/, '').trim()).find(Boolean) || '';
    return first.length > 70 ? first.slice(0, 67) + '…' : first;
  }
}
