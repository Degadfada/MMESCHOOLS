// mmenyene/repos/TeachingRepo.js — one teacher teaching one subject to one class.
import { Repository } from '../../mme/store/Repository.js';

const SELECT = `SELECT t.*, s.name AS subject, c.name AS class_name, tr.name AS teacher_name,
  (SELECT COUNT(*) FROM notes n WHERE n.teaching_id = t.id) AS note_count,
  (SELECT COUNT(*) FROM questions q WHERE q.teaching_id = t.id AND q.status = 'approved') AS question_count,
  (SELECT COUNT(*) FROM tests x WHERE x.teaching_id = t.id) AS test_count
  FROM teachings t JOIN subjects s ON s.id = t.subject_id JOIN classrooms c ON c.id = t.class_id
  JOIN teachers tr ON tr.id = t.teacher_id`;

export class TeachingRepo extends Repository {
  constructor(db) { super(db, 'teachings'); }
  full(id) { return this.db.get(SELECT + ' WHERE t.id = ?', id) || null; }
  forTeacher(teacherId) { return this.db.all(SELECT + ' WHERE t.teacher_id = ? ORDER BY s.name, c.name', teacherId); }
  inOrg(orgId) { return this.db.all(SELECT + ' WHERE s.org_id = ? ORDER BY s.name, c.name, tr.name', orgId); }
  ensure(teacherId, subjectId, classId) {
    return this.one({ teacher_id: teacherId, subject_id: subjectId, class_id: classId }) ||
      this.insert({ teacher_id: teacherId, subject_id: subjectId, class_id: classId });
  }
}
