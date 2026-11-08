// mmenyene/repos/QuestionRepo.js — the question bank.
import { Repository } from '../../mme/store/Repository.js';

export class QuestionRepo extends Repository {
  constructor(db) { super(db, 'questions', { json: ['options', 'source_note_ids'], bool: ['shared'] }); }

  forTeaching(teachingId, { status = 'approved' } = {}) {
    return this.where({ teaching_id: teachingId, status }, { order: 'topic, id' });
  }

  rejectFingerprint(teacherId, fp) {
    this.db.run('INSERT OR IGNORE INTO forge_rejects (teacher_id, fingerprint, created) VALUES (?,?,?)', teacherId, fp, Date.now());
  }
  rejected(teacherId) {
    return new Set(this.db.all('SELECT fingerprint FROM forge_rejects WHERE teacher_id = ?', teacherId).map(r => r.fingerprint));
  }
  fingerprints(teachingId) {
    return new Set(this.db.all('SELECT fingerprint FROM questions WHERE teaching_id = ? AND fingerprint IS NOT NULL', teachingId).map(r => r.fingerprint));
  }
}
