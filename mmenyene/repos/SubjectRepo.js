// mmenyene/repos/SubjectRepo.js
import { Repository } from '../../mme/store/Repository.js';

export class SubjectRepo extends Repository {
  constructor(db) { super(db, 'subjects'); }
  ensure(orgId, name) {
    name = String(name).trim().replace(/\s+/g, ' ');
    const hit = this.db.get('SELECT * FROM subjects WHERE org_id = ? AND lower(name) = lower(?)', orgId, name);
    return hit || this.insert({ org_id: orgId, name });
  }
}
