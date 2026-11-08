// edimek/LiveWatch.js — the teacher's live view of a running test.
// Every student action is pushed on the test's channel; the dashboard also pulls a
// full snapshot, so a missed event (or a buffering proxy) never leaves it wrong.
import { Grader } from './Grader.js';

export class LiveWatch {
  constructor({ hub, attempts, responses, analytics }) { Object.assign(this, { hub, attempts, responses, analytics }); }

  channel(testId) { return this.hub.channel('test:' + testId); }

  push(testId, event) { return this.channel(testId).push(event); }

  snapshot(test) {
    const attempts = this.attempts.forTest(test.id);
    const responses = this.responses.forTest(test.id);
    const byAttempt = new Map();
    for (const r of responses) {
      if (!byAttempt.has(r.attempt_id)) byAttempt.set(r.attempt_id, []);
      byAttempt.get(r.attempt_id).push(r);
    }
    const total = test.paper.length;
    const now = Date.now();
    const students = attempts.map(a => {
      const rs = byAttempt.get(a.id) || [];
      const answered = rs.filter(r => r.choice != null).length;
      const right = rs.filter(r => r.correct).length;
      return {
        id: a.id, name: a.student_name, answered, right, total,
        current: a.current, left: a.left_count,
        started: a.started, finished: a.finished, deadline: a.deadline,
        score: a.score, pct: a.finished ? Math.round((100 * (a.score || 0)) / (a.max || total)) : null,
        band: a.finished ? Grader.band((100 * (a.score || 0)) / (a.max || total)) : null,
        idle: a.finished ? 0 : Math.round((now - (a.last_seen || a.started)) / 1000)
      };
    });
    const items = this.analytics.compute(test, attempts, responses);
    const done = students.filter(s => s.finished);
    return {
      rev: this.channel(test.id).rev,
      test: { id: test.id, title: test.title, code: test.code, state: test.state, release_mode: test.release_mode,
        opened_at: test.opened_at, closes_at: test.closes_at, released_at: test.released_at, total, config: test.config },
      students, items,
      summary: {
        joined: students.length, finished: done.length,
        writing: students.filter(s => !s.finished).length,
        average: done.length ? Math.round(done.reduce((x, s) => x + s.pct, 0) / done.length) : null,
        highest: done.length ? Math.max(...done.map(s => s.pct)) : null,
        lowest: done.length ? Math.min(...done.map(s => s.pct)) : null
      }
    };
  }
}
