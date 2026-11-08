// mmenyene/repos/OcrSampleRepo.js — labelled 28x28 glyphs harvested from corrections.
import { Repository } from '../../mme/store/Repository.js';

export class OcrSampleRepo extends Repository {
  constructor(db) { super(db, 'ocr_samples', { bool: ['holdout'] }); }
  countFor(teacherId) { return this.db.get('SELECT COUNT(*) AS n FROM ocr_samples WHERE teacher_id = ?', teacherId).n; }
  allFor(teacherId) { return this.db.all('SELECT label, glyph, holdout FROM ocr_samples WHERE teacher_id = ?', teacherId); }
}
