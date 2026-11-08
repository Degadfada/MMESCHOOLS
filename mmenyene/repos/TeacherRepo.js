// mmenyene/repos/TeacherRepo.js
import { Repository } from '../../mme/store/Repository.js';

export class TeacherRepo extends Repository {
  constructor(db) { super(db, 'teachers'); }
  byEmail(email) { return this.one({ email: String(email || '').trim().toLowerCase() }); }
  inOrg(orgId) { return this.where({ org_id: orgId }, { order: 'name' }).map(TeacherRepo.public); }
  static public(t) { return t && { id: t.id, org_id: t.org_id, name: t.name, email: t.email, role: t.role, school_name: t.school_name }; }
}
