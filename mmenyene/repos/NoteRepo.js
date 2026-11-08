// mmenyene/repos/NoteRepo.js — notes plus their version history.
import { Repository } from '../../mme/store/Repository.js';

export class NoteRepo extends Repository {
  constructor(db) { super(db, 'notes', { bool: ['shared'] }); }

  forTeaching(teachingId) {
    return this.db.all(`SELECT id, teaching_id, teacher_id, title, topic, source, shared, created, updated,
      substr(body, 1, 220) AS preview, length(body) AS length FROM notes WHERE teaching_id = ?
      ORDER BY topic COLLATE NOCASE, created`, teachingId).map(r => this.out(r));
  }

  /** Notes that colleagues in the same org chose to share, for the same subject. */
  sharedForSubject(orgId, subjectId, excludeTeacher) {
    return this.db.all(`SELECT n.id, n.title, n.topic, n.teacher_id, tr.name AS teacher_name, c.name AS class_name,
      substr(n.body, 1, 220) AS preview FROM notes n
      JOIN teachings t ON t.id = n.teaching_id JOIN teachers tr ON tr.id = n.teacher_id
      JOIN classrooms c ON c.id = t.class_id
      WHERE n.shared = 1 AND tr.org_id = ? AND t.subject_id = ? AND n.teacher_id != ?
      ORDER BY n.topic, n.title`, orgId, subjectId, excludeTeacher);
  }

  search(teacherId, q) {
    const like = '%' + String(q).replace(/[%_]/g, '') + '%';
    return this.db.all(`SELECT n.id, n.teaching_id, n.title, n.topic, s.name AS subject, c.name AS class_name,
      substr(n.body, max(1, instr(lower(n.body), lower(?)) - 60), 180) AS preview
      FROM notes n JOIN teachings t ON t.id = n.teaching_id
      JOIN subjects s ON s.id = t.subject_id JOIN classrooms c ON c.id = t.class_id
      WHERE n.teacher_id = ? AND (n.title LIKE ? OR n.topic LIKE ? OR n.body LIKE ?)
      ORDER BY n.updated DESC LIMIT 50`, q, teacherId, like, like, like);
  }

  saveVersion(note) {
    this.db.run('INSERT INTO note_versions (note_id, title, body, created) VALUES (?,?,?,?)', note.id, note.title, note.body, Date.now());
  }
  versions(noteId) {
    return this.db.all('SELECT id, title, created, length(body) AS length FROM note_versions WHERE note_id = ? ORDER BY id DESC', noteId);
  }
  version(noteId, versionId) {
    return this.db.get('SELECT * FROM note_versions WHERE note_id = ? AND id = ?', noteId, versionId);
  }
}
