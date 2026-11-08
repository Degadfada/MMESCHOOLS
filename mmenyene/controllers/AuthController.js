// mmenyene/controllers/AuthController.js
import { Controller } from '../../mme/http/Controller.js';
import { SessionManager } from '../../mme/auth/SessionManager.js';

export class AuthController extends Controller {
  routes() {
    return [
      ['POST', '/api/auth/signup', 'signup', { auth: 'public' }],
      ['POST', '/api/auth/login', 'login', { auth: 'public' }],
      ['POST', '/api/auth/logout', 'logout', { auth: 'public' }],
      ['GET', '/api/me', 'me'],
      ['PUT', '/api/me', 'update']
    ];
  }

  cookie(req, res, token) {
    res.setCookie(SessionManager.COOKIE, token, { maxAge: SessionManager.TTL / 1000, secure: req.isSecure });
  }

  async signup(req, res) {
    const out = this.app.accounts.signup(await req.json());
    this.cookie(req, res, out.token);
    return { teacher: out.teacher };
  }

  async login(req, res) {
    const out = this.app.accounts.login(await req.json());
    this.cookie(req, res, out.token);
    return { teacher: out.teacher };
  }

  logout(req, res) {
    const tok = req.cookies[SessionManager.COOKIE];
    if (tok) this.app.sessions.destroy(tok);
    res.setCookie(SessionManager.COOKIE, '', { maxAge: 0 });
    return { ok: true };
  }

  me(req) { return this.app.accounts.me(req.teacher); }
  async update(req) { return this.app.accounts.updateProfile(req.teacher, await req.json()); }
}
