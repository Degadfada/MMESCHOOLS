// edimek/repos/ResponseRepo.js — one row per (attempt, question); upserted on every tap.
export class ResponseRepo {
  constructor(db) { this.db = db; }
  save(attemptId, qid, choice, correct) {
    this.db.run(`INSERT INTO responses (attempt_id, qid, choice, correct, at) VALUES (?,?,?,?,?)
      ON CONFLICT(attempt_id, qid) DO UPDATE SET choice = excluded.choice, correct = excluded.correct, at = excluded.at`,
      attemptId, qid, choice, correct ? 1 : 0, Date.now());
  }
  forAttempt(attemptId) {
    const out = new Map();
    for (const r of this.db.all('SELECT * FROM responses WHERE attempt_id = ?', attemptId)) out.set(r.qid, r);
    return out;
  }
  forTest(testId) {
    return this.db.all(`SELECT r.* FROM responses r JOIN attempts a ON a.id = r.attempt_id
      WHERE a.test_id = ? AND a.removed = 0`, testId);
  }
}
