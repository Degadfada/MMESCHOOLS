// mmenyene/bank/QuestionBank.js — approved questions kept for reuse, per class.
import { HttpError } from '../../mme/http/Request.js';
import { QuestionForge } from '../forge/QuestionForge.js';
import { DifficultyModel } from '../forge/DifficultyModel.js';

export class QuestionBank {
  constructor({ questions, notebook }) { this.questions = questions; this.notebook = notebook; }

  static view(q) {
    const d = DifficultyModel.blend(q.difficulty_pred ?? 2.5, q.difficulty_obs, q.sittings);
    return {
      id: q.id, teaching_id: q.teaching_id, template: q.template, bloom: q.bloom, topic: q.topic,
      stem: q.stem, options: q.options, answer: q.answer, source: q.source_text,
      difficulty: d, level: DifficultyModel.level(d), predicted: q.difficulty_pred,
      observed: q.difficulty_obs, sittings: q.sittings, shared: q.shared, fingerprint: q.fingerprint
    };
  }

  list(teacher, teachingId) {
    const t = this.notebook.teaching(teacher, teachingId);
    return this.questions.forTeaching(t.id).map(QuestionBank.view);
  }

  own(teacher, id) {
    const q = this.questions.find(Number(id));
    if (!q) throw new HttpError(404, 'question not found');
    if (q.teacher_id !== teacher.id) throw new HttpError(403, 'not your question');
    return q;
  }

  /** Save forge output (possibly edited by the teacher) into the bank. */
  save(teacher, teachingId, items) {
    const t = this.notebook.teaching(teacher, teachingId);
    const saved = [];
    this.questions.db.tx(() => {
      for (const raw of items) {
        let q;
        try { q = QuestionForge.normaliseEdited(raw); } catch (e) { throw new HttpError(400, e.message); }
        const dup = q.fingerprint && this.questions.one({ teaching_id: t.id, fingerprint: q.fingerprint });
        if (dup) { saved.push(dup); continue; }
        saved.push(this.questions.insert({
          teaching_id: t.id, teacher_id: teacher.id, template: q.template || 'custom', bloom: q.bloom || null,
          topic: q.topic || '', stem: q.stem, options: q.options, answer: q.answer,
          difficulty_pred: Number(q.difficulty) || 2.5, source_text: q.source || null,
          source_note_ids: q.noteId ? [q.noteId] : [], fingerprint: q.fingerprint, status: 'approved'
        }));
      }
    });
    return saved.map(QuestionBank.view);
  }

  update(teacher, id, patch) {
    const q = this.own(teacher, id);
    let n;
    try { n = QuestionForge.normaliseEdited({ ...QuestionBank.view(q), ...patch, fingerprint: q.fingerprint }); }
    catch (e) { throw new HttpError(400, e.message); }
    return QuestionBank.view(this.questions.update(q.id, {
      stem: n.stem, options: n.options, answer: n.answer, topic: patch.topic ?? q.topic,
      shared: patch.shared !== undefined ? !!patch.shared : undefined
    }));
  }

  remove(teacher, id) { this.questions.update(this.own(teacher, id).id, { status: 'retired' }); }

  /** Questions as stored on a test paper (a frozen snapshot). */
  snapshot(teacher, ids) {
    return ids.map(id => {
      const q = this.own(teacher, id);
      return { qid: 'q' + q.id, bankId: q.id, stem: q.stem, options: q.options, answer: q.answer, topic: q.topic, source: q.source_text, level: QuestionBank.view(q).level };
    });
  }
}
