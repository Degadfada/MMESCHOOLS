// mme/http/Controller.js — base for every controller: declare routes in routes(),
// get small helpers for validation and ownership checks.
import { HttpError } from './Request.js';

export class Controller {
  constructor(app) { this.app = app; }

  /** Subclasses return [[method, path, handlerName, opts], ...]. */
  routes() { return []; }

  register(router) {
    for (const [method, path, name, opts = {}] of this.routes()) {
      const fn = this[name];
      if (typeof fn !== 'function') throw new Error(`${this.constructor.name}.${name} is not a method`);
      router.add(method, path, (req, res) => fn.call(this, req, res), { auth: 'teacher', ...opts });
    }
  }

  require(obj, ...fields) {
    for (const f of fields) {
      const v = obj[f];
      if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) throw new HttpError(400, `${f} is required`);
    }
  }

  found(thing, what = 'item') {
    if (!thing) throw new HttpError(404, `${what} not found`);
    return thing;
  }

  forbid(cond, msg = 'not allowed') { if (cond) throw new HttpError(403, msg); }

  int(v, what = 'id') {
    const n = Number(v);
    if (!Number.isInteger(n)) throw new HttpError(400, `bad ${what}`);
    return n;
  }
}
