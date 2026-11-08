// mmenyene/repos/ScanRepo.js — snapped pages, what OCR read, and what the teacher kept.
import { Repository } from '../../mme/store/Repository.js';

export class ScanRepo extends Repository {
  constructor(db) { super(db, 'page_scans', { json: ['ocr_json'] }); }
}
