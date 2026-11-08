// edimek/Sitting.js — the student's side. Students do not have accounts: they open the
// link, type their name, and a device cookie ties the attempt to their phone, so a
// refresh (or a dropped connection) resumes instead of starting again.
import crypto from 'node:crypto';
import { HttpError } from '../mme/http/Request.js';
import { Grader } from './Grader.js';
import { ReleasePolicy } from './ReleasePolicy.js';

const GRACE_MS = 15_000;     // network slack after the deadline

export class Sitting {
  static COOKIE = 'mme_dev';

  constructor({ tests, attempts, responses, live, testService, notebook }) {
    Object.assign(this, { tests, attempts, responses, live, testService, notebook });
  }

  static newDevice() { return crypto.randomBytes(16).toString('base64url'); }

  test(code) {
    const t = this.tests.byCode(code);
    if (!t || t.state === 'draft') throw new HttpError(404, 'there is no test with that code');
    return t;
  }

  attemptFor(test, device) {
    const a = device ? this.attempts.byDevice(test.id, device) : null;
    return a && !a.removed ? a : null;
  }

  info(code, device) {
    const t = this.test(code);
    const teaching = this.notebook.teachings.full(t.teaching_id);
    const a = this.attemptFor(t, device);
    return {
      title: t.title, subject: teaching.subject, className: teaching.class_name, teacher: teaching.teacher_name,
      questions: t.paper.length, durationMin: t.config.durationMin, instructions: t.config.instructions,
      state: t.state, releaseMode: t.release_mode,
      me: a ? this.status(t, a) : null
    };
  }

  status(test, a) {
    const policy = ReleasePolicy.for(test);
    return {
      name: a.student_name, finished: !!a.finished, deadline: a.deadline, now: Date.now(),
      resultVisible: policy.visible(test, a), waiting: !!a.finished && !policy.visible(test, a),
      waitingMessage: policy.waitingMessage()
    };
  }

  join(code, device, name) {
    const t = this.test(code);
    const existing = this.attemptFor(t, device);
    if (existing) return { attempt: existing, resumed: true };
    if (t.state !== 'open') throw new HttpError(409, t.state === 'closed' || t.state === 'released' ? 'this test has closed' : 'this test is not open yet');
    name = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    if (name.length < 2) throw new HttpError(400, 'please type your full name');
    if (this.attempts.nameTaken(t.id, name)) throw new HttpError(409, 'someone has already joined with that name — add your surname or class number');
    const now = Date.now();
    const attempt = this.attempts.insert({
      test_id: t.id, student_name: name, device_token: device,
      layout: Grader.layout(t.paper, t.config, now ^ crypto.randomBytes(4).readUInt32LE(0)),
      started: now, deadline: now + t.config.durationMin * 60_000, last_seen: now
    });
    this.live.push(t.id, { type: 'joined', attemptId: attempt.id, name });
    return { attempt, resumed: false };
  }

  mine(code, device) {
    const t = this.test(code);
    const a = this.attemptFor(t, device);
    if (!a) throw new HttpError(401, 'join the test first');
    return { t, a };
  }

  paper(code, device) {
    const { t, a } = this.mine(code, device);
    const g = new Grader(t);
    const rs = this.responses.forAttempt(a.id);
    const answers = {};
    for (const [qid, r] of rs) if (r.choice != null) answers[qid] = a.layout.perm[qid].indexOf(r.choice);
    this.attempts.update(a.id, { last_seen: Date.now() });
    return { ...this.status(t, a), questions: a.finished ? [] : g.publicPaper(a.layout), answers, current: a.current };
  }

  overdue(a) { return a.deadline && Date.now() > a.deadline + GRACE_MS; }

  answer(code, device, { qid, choice }) {
    const { t, a } = this.mine(code, device);
    if (a.finished) throw new HttpError(409, 'you have already submitted');
    if (t.state !== 'open') { this.testService.finalise(t, a); throw new HttpError(409, 'the test has been closed'); }
    if (this.overdue(a)) { this.testService.finalise(t, a); throw new HttpError(409, 'time is up'); }
    const mark = new Grader(t).mark(a.layout, String(qid), choice);
    if (!mark) throw new HttpError(400, 'that answer does not fit the question');
    this.responses.save(a.id, String(qid), mark.original, mark.correct);
    const idx = a.layout.order.indexOf(String(qid));
    this.attempts.update(a.id, { last_seen: Date.now(), current: idx });
    const answered = [...this.responses.forAttempt(a.id).values()].filter(r => r.choice != null).length;
    this.live.push(t.id, { type: 'answer', attemptId: a.id, qid, n: idx + 1, answered, correct: mark.correct, choice: mark.original });
    return { ok: true, answered };
  }

  view(code, device, { n, hidden }) {
    const { t, a } = this.mine(code, device);
    if (a.finished) return { ok: true };
    const patch = { last_seen: Date.now() };
    if (Number.isInteger(n)) patch.current = n;
    if (hidden === true) patch.left_count = (a.left_count || 0) + 1;
    this.attempts.update(a.id, patch);
    this.live.push(t.id, { type: hidden === true ? 'left' : hidden === false ? 'back' : 'view', attemptId: a.id, n });
    return { ok: true };
  }

  finish(code, device) {
    const { t, a } = this.mine(code, device);
    const done = a.finished ? a : this.testService.finalise(t, a);
    return this.result(code, device, done);
  }

  result(code, device, known) {
    const t = this.test(code);
    const a = known || this.attemptFor(t, device);
    if (!a) throw new HttpError(401, 'join the test first');
    if (!a.finished && this.overdue(a)) return this.result(code, device, this.testService.finalise(t, a));
    const status = this.status(t, a);
    if (!status.resultVisible) return status;
    const g = new Grader(t);
    const pct = Math.round((100 * (a.score || 0)) / (a.max || t.paper.length));
    return {
      ...status, score: a.score, max: a.max, pct, band: Grader.band(pct),
      review: t.config.showCorrections ? g.review(a.layout, this.responses.forAttempt(a.id), t.config) : null
    };
  }
}
