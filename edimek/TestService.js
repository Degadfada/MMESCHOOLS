// edimek/TestService.js — the teacher's side of a test: set it up, open it, watch it,
// close it, release results, read the analysis.
//   draft → open (code + link live) → closed (no more answers) → released (results out)
import { HttpError } from '../mme/http/Request.js';
import { Grader } from './Grader.js';

const DEFAULTS = { durationMin: 30, shuffleQuestions: true, shuffleOptions: true, showCorrections: true, showSource: true, instructions: 'Answer all questions. Choose the best option for each.' };

export class TestService {
  constructor({ tests, attempts, responses, bank, notebook, live, analytics }) {
    Object.assign(this, { tests, attempts, responses, bank, notebook, live, analytics });
  }

  own(teacher, id) {
    const t = this.tests.find(Number(id));
    if (!t) throw new HttpError(404, 'test not found');
    if (t.teacher_id !== teacher.id) throw new HttpError(403, 'that test belongs to another teacher');
    return t;
  }

  list(teacher) { return this.tests.list(teacher.id); }

  view(teacher, id) {
    const t = this.own(teacher, id);
    return { ...t, teaching: this.notebook.teachings.full(t.teaching_id) };
  }

  create(teacher, { teachingId, title, questionIds, config = {}, releaseMode = 'instant' }) {
    const teaching = this.notebook.teaching(teacher, teachingId);
    if (!Array.isArray(questionIds) || !questionIds.length) throw new HttpError(400, 'choose at least one question');
    const paper = this.bank.snapshot(teacher, questionIds);
    const cfg = { ...DEFAULTS, ...TestService.cleanConfig(config) };
    return this.tests.insert({
      teaching_id: teaching.id, teacher_id: teacher.id,
      title: String(title || `${teaching.subject} test`).trim().slice(0, 120),
      config: cfg, paper, state: 'draft', release_mode: releaseMode === 'on-release' ? 'on-release' : 'instant'
    });
  }

  static cleanConfig(c) {
    const out = {};
    if (c.durationMin !== undefined) out.durationMin = Math.max(1, Math.min(300, Number(c.durationMin) || 30));
    for (const k of ['shuffleQuestions', 'shuffleOptions', 'showCorrections', 'showSource']) if (c[k] !== undefined) out[k] = !!c[k];
    if (c.instructions !== undefined) out.instructions = String(c.instructions).slice(0, 600);
    return out;
  }

  update(teacher, id, { title, config, releaseMode }) {
    const t = this.own(teacher, id);
    const patch = {};
    if (title) patch.title = String(title).trim().slice(0, 120);
    if (config) {
      if (t.state !== 'draft' && config.durationMin !== undefined) delete config.durationMin;
      patch.config = { ...t.config, ...TestService.cleanConfig(config) };
    }
    if (releaseMode) patch.release_mode = releaseMode === 'on-release' ? 'on-release' : 'instant';
    const next = this.tests.update(t.id, patch);
    this.live.push(t.id, { type: 'test', state: next.state });
    return next;
  }

  open(teacher, id) {
    const t = this.own(teacher, id);
    if (t.state === 'open') return t;
    const code = t.code || this.tests.newCode();
    const next = this.tests.update(t.id, { state: 'open', code, opened_at: t.opened_at || Date.now(), closed_at: null });
    this.live.push(t.id, { type: 'test', state: 'open' });
    return next;
  }

  close(teacher, id) {
    const t = this.own(teacher, id);
    this.finaliseAll(t);
    const next = this.tests.update(t.id, { state: t.state === 'released' ? 'released' : 'closed', closed_at: Date.now() });
    this.commitAnalytics(next);
    this.live.push(t.id, { type: 'test', state: next.state });
    return next;
  }

  release(teacher, id) {
    let t = this.own(teacher, id);
    if (t.state === 'open') t = this.close(teacher, id);
    const next = this.tests.update(t.id, { state: 'released', released_at: Date.now() });
    this.live.push(t.id, { type: 'released' });
    return next;
  }

  reopen(teacher, id) {
    const t = this.own(teacher, id);
    const next = this.tests.update(t.id, { state: 'open', closed_at: null, released_at: null });
    this.live.push(t.id, { type: 'test', state: 'open' });
    return next;
  }

  extend(teacher, id, { minutes = 5, attemptId }) {
    const t = this.own(teacher, id);
    const add = Math.max(1, Math.min(120, Number(minutes) || 5)) * 60_000;
    const list = attemptId ? [this.attempts.find(Number(attemptId))] : this.attempts.forTest(t.id);
    for (const a of list) {
      if (!a || a.test_id !== t.id || a.finished) continue;
      this.attempts.update(a.id, { deadline: (a.deadline || Date.now()) + add });
    }
    this.live.push(t.id, { type: 'extended', minutes: add / 60_000 });
    return { ok: true };
  }

  renameStudent(teacher, id, attemptId, name) {
    const t = this.own(teacher, id);
    const a = this.attempts.find(Number(attemptId));
    if (!a || a.test_id !== t.id) throw new HttpError(404, 'student not found');
    name = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!name) throw new HttpError(400, 'name is empty');
    this.attempts.update(a.id, { student_name: name });
    this.live.push(t.id, { type: 'student', attemptId: a.id });
    return { ok: true };
  }

  removeStudent(teacher, id, attemptId) {
    const t = this.own(teacher, id);
    const a = this.attempts.find(Number(attemptId));
    if (!a || a.test_id !== t.id) throw new HttpError(404, 'student not found');
    this.attempts.update(a.id, { removed: true });
    this.live.push(t.id, { type: 'student', attemptId: a.id, removed: true });
    return { ok: true };
  }

  delete(teacher, id) {
    const t = this.own(teacher, id);
    if (t.state === 'open') throw new HttpError(409, 'close the test before deleting it');
    this.tests.delete(t.id);
  }

  /** Mark every unfinished attempt as finished (time up or test closed). */
  finaliseAll(test) {
    for (const a of this.attempts.forTest(test.id)) if (!a.finished) this.finalise(test, a);
  }

  finalise(test, attempt) {
    const g = new Grader(test);
    const { score, max } = g.score(this.responses.forAttempt(attempt.id));
    const a = this.attempts.update(attempt.id, { finished: Date.now(), score, max });
    this.live.push(test.id, { type: 'finished', attemptId: a.id, name: a.student_name, score, max });
    return a;
  }

  commitAnalytics(test) {
    const items = this.analytics.compute(test, this.attempts.forTest(test.id), this.responses.forTest(test.id));
    this.analytics.commit(items);
    return items;
  }

  results(teacher, id) {
    const t = this.own(teacher, id);
    return this.live.snapshot(t);
  }

  csv(teacher, id) {
    const t = this.own(teacher, id);
    const snap = this.live.snapshot(t);
    const esc = (v) => /[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? '');
    const rows = [['Name', 'Score', 'Out of', 'Percent', 'Band', 'Answered', 'Left page', 'Started', 'Finished']];
    for (const s of snap.students.slice().sort((a, b) => a.name.localeCompare(b.name))) {
      rows.push([s.name, s.score ?? '', s.total, s.pct ?? '', s.band ?? '', s.answered, s.left,
        new Date(s.started).toLocaleString('en-GB'), s.finished ? new Date(s.finished).toLocaleString('en-GB') : '']);
    }
    return { filename: `${t.title.replace(/[^\w\- ]+/g, '').trim() || 'test'} results.csv`, text: rows.map(r => r.map(esc).join(',')).join('\r\n') };
  }

  /** Called every few seconds: finish attempts whose time is up. */
  sweep() {
    const overdue = this.attempts.db.all(`SELECT a.id, a.test_id FROM attempts a JOIN tests t ON t.id = a.test_id
      WHERE a.finished IS NULL AND a.removed = 0 AND a.deadline IS NOT NULL AND a.deadline < ?`, Date.now() - 5000);
    for (const row of overdue) {
      const test = this.tests.find(row.test_id);
      const a = this.attempts.find(row.id);
      if (test && a && !a.finished) this.finalise(test, a);
    }
  }
}
