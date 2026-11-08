// mme/auth/PasswordHasher.js — scrypt from node's crypto; constant-time compare.
import crypto from 'node:crypto';

export class PasswordHasher {
  constructor({ N = 16384, keylen = 32 } = {}) { this.N = N; this.keylen = keylen; }

  hash(password) {
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(String(password), salt, this.keylen, { N: this.N });
    return `scrypt$${this.N}$${salt.toString('base64')}$${key.toString('base64')}`;
  }

  verify(password, stored) {
    const [alg, N, salt, key] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const want = Buffer.from(key, 'base64');
    const got = crypto.scryptSync(String(password), Buffer.from(salt, 'base64'), want.length, { N: Number(N) });
    return crypto.timingSafeEqual(want, got);
  }
}
