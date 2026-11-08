// mmenyene/forge/ForgeService.js — the teacher-facing side of the Forge: pick which
// notes to read, remember what she rejected, spin, and re-spin single questions.
import { HttpError } from '../../mme/http/Request.js';
import { QuestionForge } from './QuestionForge.js';

export class ForgeService {
  constructor({ notebook, notes, questions, forge = new QuestionForge() }) {
    Object.assign(this, { notebook, notes, questions, forge });
  }

  catalogue() { return QuestionForge.catalogue(); }

  notesFor(teacher, teachingId, noteIds) {
    const t = this.notebook.teaching(teacher, teachingId);
    let list = this.notes.where({ teaching_id: t.id });
    if (noteIds && noteIds.length) {
      const want = new Set(noteIds.map(Number));
      list = list.filter(n => want.has(n.id));
      // Shared colleague notes the teacher picked explicitly.
      for (const id of want) if (!list.some(n => n.id === id)) list.push(this.notebook.note(teacher, id));
    }
    if (!list.length) throw new HttpError(400, 'there are no notes to read yet — add some notes first');
    return { teaching: t, notes: list };
  }

  spin(teacher, { teachingId, noteIds, count = 10, mix, templates, seed, avoidAtoms = [], skipBanked = true }) {
    const { notes } = this.notesFor(teacher, teachingId, noteIds);
    const exclude = this.questions.rejected(teacher.id);
    if (skipBanked) for (const fp of this.questions.fingerprints(Number(teachingId))) exclude.add(fp);
    const n = Math.max(1, Math.min(100, Number(count) || 10));
    const result = this.forge.spin(notes, {
      count: n, mix: mix || { easy: 1, medium: 1, hard: 1 }, templates,
      seed: Number.isFinite(Number(seed)) ? Number(seed) : Date.now(), exclude, avoidAtoms
    });
    result.notes = notes.map(x => ({ id: x.id, title: x.title }));
    return result;
  }

  /** One replacement question at a given level, avoiding what is already on the paper. */
  respin(teacher, { teachingId, noteIds, level = 'medium', templates, avoidAtoms = [] }) {
    const mix = { easy: 0, medium: 0, hard: 0, [level]: 1 };
    const r = this.spin(teacher, { teachingId, noteIds, count: 1, mix, templates, avoidAtoms, seed: Date.now() });
    if (!r.questions.length) throw new HttpError(404, 'no more questions can be made from these notes — add notes or change settings');
    return r.questions[0];
  }

  reject(teacher, fingerprint) {
    if (fingerprint) this.questions.rejectFingerprint(teacher.id, String(fingerprint));
  }
}
