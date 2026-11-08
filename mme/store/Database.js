// mme/store/Database.js — node's built-in sqlite (no dependency), with numbered
// migrations tracked in PRAGMA user_version and a statement cache.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export class Database {
  constructor(file) {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    this.file = file;
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
    this.cache = new Map();
  }

  stmt(sql) {
    let s = this.cache.get(sql);
    if (!s) { s = this.db.prepare(sql); this.cache.set(sql, s); }
    return s;
  }
  all(sql, ...p) { return this.stmt(sql).all(...p); }
  get(sql, ...p) { return this.stmt(sql).get(...p); }
  run(sql, ...p) { return this.stmt(sql).run(...p); }
  exec(sql) { this.db.exec(sql); }

  tx(fn) {
    this.db.exec('BEGIN');
    try { const out = fn(); this.db.exec('COMMIT'); return out; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }

  /** migrations: array of SQL strings; index i is version i+1. */
  migrate(migrations) {
    const current = this.get('PRAGMA user_version').user_version;
    for (let v = current; v < migrations.length; v++) {
      this.tx(() => { this.db.exec(migrations[v]); this.db.exec(`PRAGMA user_version = ${v + 1}`); });
    }
    return migrations.length - current;
  }

  hasFts() {
    try { this.db.exec('CREATE VIRTUAL TABLE IF NOT EXISTS temp._fts_probe USING fts5(x); DROP TABLE temp._fts_probe;'); return true; }
    catch { return false; }
  }

  backup(toFile) {
    fs.mkdirSync(path.dirname(toFile), { recursive: true });
    this.db.exec(`VACUUM INTO '${toFile.replace(/'/g, "''")}'`);
    return toFile;
  }

  close() { this.db.close(); }
}
