// mme/store/schema.js — migrations. Append new entries; never edit a shipped one.

export const MIGRATIONS = [
  /* 1: org, people, teaching structure */ `
  CREATE TABLE orgs (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'team',
    invite_code TEXT UNIQUE NOT NULL, motto TEXT, created INTEGER
  );
  CREATE TABLE teachers (
    id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL REFERENCES orgs(id),
    name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, pass_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'teacher', school_name TEXT, created INTEGER
  );
  CREATE TABLE sessions (
    token TEXT PRIMARY KEY, teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    expires INTEGER NOT NULL, created INTEGER
  );
  CREATE TABLE subjects (
    id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL REFERENCES orgs(id), name TEXT NOT NULL,
    created INTEGER, UNIQUE(org_id, name)
  );
  CREATE TABLE classrooms (
    id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL REFERENCES orgs(id), name TEXT NOT NULL,
    created INTEGER, UNIQUE(org_id, name)
  );
  CREATE TABLE teachings (
    id INTEGER PRIMARY KEY, teacher_id INTEGER NOT NULL REFERENCES teachers(id),
    subject_id INTEGER NOT NULL REFERENCES subjects(id), class_id INTEGER NOT NULL REFERENCES classrooms(id),
    created INTEGER, UNIQUE(teacher_id, subject_id, class_id)
  );

  CREATE TABLE notes (
    id INTEGER PRIMARY KEY, teaching_id INTEGER NOT NULL REFERENCES teachings(id) ON DELETE CASCADE,
    teacher_id INTEGER NOT NULL REFERENCES teachers(id),
    title TEXT NOT NULL, topic TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'typed', shared INTEGER NOT NULL DEFAULT 0,
    created INTEGER, updated INTEGER
  );
  CREATE INDEX notes_teaching ON notes(teaching_id);
  CREATE TABLE note_versions (
    id INTEGER PRIMARY KEY, note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    title TEXT, body TEXT, created INTEGER
  );

  CREATE TABLE page_scans (
    id INTEGER PRIMARY KEY, teacher_id INTEGER NOT NULL REFERENCES teachers(id),
    note_id INTEGER REFERENCES notes(id) ON DELETE SET NULL,
    image_path TEXT, ocr_json TEXT, final_text TEXT, model_version TEXT, created INTEGER
  );
  CREATE TABLE ocr_samples (
    id INTEGER PRIMARY KEY, teacher_id INTEGER REFERENCES teachers(id),
    label TEXT NOT NULL, glyph BLOB NOT NULL, origin TEXT NOT NULL DEFAULT 'correction',
    holdout INTEGER NOT NULL DEFAULT 0, created INTEGER
  );
  CREATE TABLE ocr_models (
    id INTEGER PRIMARY KEY, teacher_id INTEGER REFERENCES teachers(id),
    version INTEGER NOT NULL, path TEXT NOT NULL, cer REAL, samples INTEGER, active INTEGER NOT NULL DEFAULT 0,
    created INTEGER
  );

  CREATE TABLE questions (
    id INTEGER PRIMARY KEY, teaching_id INTEGER NOT NULL REFERENCES teachings(id) ON DELETE CASCADE,
    teacher_id INTEGER NOT NULL REFERENCES teachers(id),
    template TEXT NOT NULL, bloom TEXT, topic TEXT, stem TEXT NOT NULL,
    options TEXT NOT NULL, answer INTEGER NOT NULL,
    difficulty_pred REAL, difficulty_obs REAL, sittings INTEGER NOT NULL DEFAULT 0,
    source_text TEXT, source_note_ids TEXT, fingerprint TEXT,
    status TEXT NOT NULL DEFAULT 'approved', shared INTEGER NOT NULL DEFAULT 0,
    created INTEGER, updated INTEGER
  );
  CREATE INDEX questions_teaching ON questions(teaching_id);
  CREATE TABLE forge_rejects (
    teacher_id INTEGER NOT NULL, fingerprint TEXT NOT NULL, created INTEGER,
    PRIMARY KEY (teacher_id, fingerprint)
  );

  CREATE TABLE tests (
    id INTEGER PRIMARY KEY, teaching_id INTEGER NOT NULL REFERENCES teachings(id) ON DELETE CASCADE,
    teacher_id INTEGER NOT NULL REFERENCES teachers(id),
    title TEXT NOT NULL, code TEXT UNIQUE, config TEXT NOT NULL, paper TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'draft', release_mode TEXT NOT NULL DEFAULT 'instant',
    opened_at INTEGER, closes_at INTEGER, closed_at INTEGER, released_at INTEGER,
    created INTEGER, updated INTEGER
  );
  CREATE TABLE attempts (
    id INTEGER PRIMARY KEY, test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
    student_name TEXT NOT NULL, device_token TEXT NOT NULL, layout TEXT NOT NULL,
    started INTEGER, finished INTEGER, deadline INTEGER, score REAL, max REAL,
    current INTEGER NOT NULL DEFAULT 0, left_count INTEGER NOT NULL DEFAULT 0,
    last_seen INTEGER, removed INTEGER NOT NULL DEFAULT 0,
    UNIQUE(test_id, device_token)
  );
  CREATE TABLE responses (
    attempt_id INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    qid TEXT NOT NULL, choice INTEGER, correct INTEGER, at INTEGER,
    PRIMARY KEY (attempt_id, qid)
  );
  `
];
