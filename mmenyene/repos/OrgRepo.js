// mmenyene/repos/OrgRepo.js — a team today, a school tomorrow (type column).
import crypto from 'node:crypto';
import { Repository } from '../../mme/store/Repository.js';

export class OrgRepo extends Repository {
  constructor(db) { super(db, 'orgs'); }
  newInviteCode() {
    for (;;) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      if (!this.one({ invite_code: code })) return code;
    }
  }
  byInvite(code) { return this.one({ invite_code: String(code || '').trim().toUpperCase() }); }
}
