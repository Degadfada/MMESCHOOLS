// edimek/repos/TestRepo.js — tests hold a frozen snapshot of their questions (paper),
// so editing the bank later never changes a test that students already sat.
import { Repository } from '../../mme/store/Repository.js';

export class TestRepo extends Repository {
  constructor(db) { super(db, 'tests', { json: ['config', 'paper'] }); }

  byCode(code) { return this.one({ code: String(code || '').trim().toUpperCase() }); }

  newCode() {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (;;) {
      let c = '';
      for (let i = 0; i < 6; i++) c += A[Math.floor(Math.random() * A.length)];
      if (!this.byCode(c)) return c;
    }
  }

  list(teacherId) {
    return this.db.all(`SELECT x.id, x.title, x.code, x.state, x.release_mode, x.teaching_id, x.created, x.opened_at,
      x.closed_at, x.released_at, s.name AS subject, c.name AS class_name,
      (SELECT COUNT(*) FROM attempts a WHERE a.test_id = x.id AND a.removed = 0) AS students,
      (SELECT ROUND(AVG(100.0 * a.score / a.max)) FROM attempts a WHERE a.test_id = x.id AND a.finished IS NOT NULL AND a.removed = 0) AS avg_pct
      FROM tests x JOIN teachings t ON t.id = x.teaching_id
      JOIN subjects s ON s.id = t.subject_id JOIN classrooms c ON c.id = t.class_id
      WHERE x.teacher_id = ? ORDER BY x.id DESC`, teacherId);
  }
}
