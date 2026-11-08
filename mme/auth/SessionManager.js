// mme/auth/SessionManager.js — opaque random session tokens in sqlite, carried in
// an HttpOnly cookie. Sliding 30-day expiry.
import crypto from 'node:crypto';

export class SessionManager {
  static COOKIE = 'mme_sid';
  static TTL = 30 * 24 * 3600 * 1000;

  constructor(db) { this.db = db; }

  create(teacherId) {
    const token = crypto.randomBytes(24).toString('base64url');
    this.db.run('INSERT INTO sessions (token, teacher_id, expires, created) VALUES (?,?,?,?)',
      token, teacherId, Date.now() + SessionManager.TTL, Date.now());
    return token;
  }

  resolve(token) {
    if (!token) return null;
    const s = this.db.get('SELECT * FROM sessions WHERE token = ?', token);
    if (!s) return null;
    if (s.expires < Date.now()) { this.destroy(token); return null; }
    if (s.expires - Date.now() < SessionManager.TTL / 2) {
      this.db.run('UPDATE sessions SET expires = ? WHERE token = ?', Date.now() + SessionManager.TTL, token);
    }
    return s.teacher_id;
  }

  destroy(token) { this.db.run('DELETE FROM sessions WHERE token = ?', token); }
}
