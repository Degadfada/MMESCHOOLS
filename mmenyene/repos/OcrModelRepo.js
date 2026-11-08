// mmenyene/repos/OcrModelRepo.js — versions of each teacher's personal handwriting model.
import { Repository } from '../../mme/store/Repository.js';

export class OcrModelRepo extends Repository {
  constructor(db) { super(db, 'ocr_models', { bool: ['active'] }); }
  active(teacherId) {
    return this.out(this.db.get('SELECT * FROM ocr_models WHERE teacher_id = ? AND active = 1 ORDER BY version DESC LIMIT 1', teacherId));
  }
  history(teacherId) { return this.where({ teacher_id: teacherId }, { order: 'version' }); }
  promote(teacherId, id) {
    this.db.run('UPDATE ocr_models SET active = 0 WHERE teacher_id = ?', teacherId);
    this.db.run('UPDATE ocr_models SET active = 1 WHERE id = ?', id);
  }
}
