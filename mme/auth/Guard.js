// mme/auth/Guard.js — route middleware. Routes declare { auth: 'teacher' | 'owner' | 'public' }.
// Students never authenticate: their routes are 'public' and scoped by test code + device token.
import { HttpError } from '../http/Request.js';
import { SessionManager } from './SessionManager.js';

export class Guard {
  constructor(sessions, teachers) { this.sessions = sessions; this.teachers = teachers; }

  middleware() {
    return async (req, _res, opts) => {
      const need = opts.auth || 'teacher';
      const id = this.sessions.resolve(req.cookies[SessionManager.COOKIE]);
      if (id) req.teacher = this.teachers.find(id);
      if (need === 'public') return;
      if (!req.teacher) throw new HttpError(401, 'please sign in');
      if (need === 'owner' && req.teacher.role !== 'owner') throw new HttpError(403, 'only the team owner can do that');
    };
  }
}
