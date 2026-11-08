// edimek/repos/AttemptRepo.js — one student's sitting of one test.
import { Repository } from '../../mme/store/Repository.js';

export class AttemptRepo extends Repository {
  constructor(db) { super(db, 'attempts', { json: ['layout'], bool: ['removed'] }); }
  forTest(testId) { return this.where({ test_id: testId, removed: 0 }, { order: 'started' }); }
  byDevice(testId, token) { return this.one({ test_id: testId, device_token: token }); }
  nameTaken(testId, name, exceptId = 0) {
    return !!this.db.get('SELECT 1 FROM attempts WHERE test_id = ? AND removed = 0 AND id != ? AND lower(student_name) = lower(?)', testId, exceptId, name);
  }
}
