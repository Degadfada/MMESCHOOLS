// mmenyene/repos/ClassRoomRepo.js — "JSS2A", "SS1 Science", "Primary 5".
import { Repository } from '../../mme/store/Repository.js';

export class ClassRoomRepo extends Repository {
  constructor(db) { super(db, 'classrooms'); }
  ensure(orgId, name) {
    name = String(name).trim().replace(/\s+/g, ' ');
    const hit = this.db.get('SELECT * FROM classrooms WHERE org_id = ? AND lower(name) = lower(?)', orgId, name);
    return hit || this.insert({ org_id: orgId, name });
  }
}
