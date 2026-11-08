// mme/store/Repository.js — base CRUD over one table. Subclasses name the table,
// list JSON / boolean columns, and add domain queries.

export class Repository {
  /** @param {import('./Database.js').Database} db */
  constructor(db, table, { json = [], bool = [] } = {}) {
    this.db = db; this.table = table; this.jsonCols = json; this.boolCols = bool;
    this.columns = new Set(db.all(`PRAGMA table_info(${table})`).map(c => c.name));
  }

  out(row) {
    if (!row) return null;
    const o = { ...row };
    for (const c of this.jsonCols) if (typeof o[c] === 'string') { try { o[c] = JSON.parse(o[c]); } catch { /* keep raw */ } }
    for (const c of this.boolCols) if (c in o) o[c] = !!o[c];
    return o;
  }

  in(obj) {
    const o = {};
    for (const [k, v] of Object.entries(obj)) {
      if (!this.columns.has(k) || v === undefined) continue;
      if (this.jsonCols.includes(k) && v !== null && typeof v !== 'string') o[k] = JSON.stringify(v);
      else if (typeof v === 'boolean') o[k] = v ? 1 : 0;
      else o[k] = v;
    }
    return o;
  }

  find(id) { return this.out(this.db.get(`SELECT * FROM ${this.table} WHERE id = ?`, id)); }

  where(filter = {}, { order = 'id', limit } = {}) {
    const f = this.in(filter);
    const keys = Object.keys(f);
    const sql = `SELECT * FROM ${this.table}` + (keys.length ? ' WHERE ' + keys.map(k => `${k} = ?`).join(' AND ') : '') +
      ` ORDER BY ${order}` + (limit ? ` LIMIT ${Number(limit)}` : '');
    return this.db.all(sql, ...keys.map(k => f[k])).map(r => this.out(r));
  }

  one(filter) { return this.where(filter, { limit: 1 })[0] || null; }

  insert(obj) {
    const o = this.in(obj);
    if (this.columns.has('created') && o.created === undefined) o.created = Date.now();
    const keys = Object.keys(o);
    const r = this.db.run(`INSERT INTO ${this.table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...keys.map(k => o[k]));
    return this.find(Number(r.lastInsertRowid));
  }

  update(id, patch) {
    const o = this.in(patch);
    delete o.id;
    if (this.columns.has('updated')) o.updated = Date.now();
    const keys = Object.keys(o);
    if (keys.length) this.db.run(`UPDATE ${this.table} SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map(k => o[k]), id);
    return this.find(id);
  }

  delete(id) { return this.db.run(`DELETE FROM ${this.table} WHERE id = ?`, id).changes > 0; }
}
