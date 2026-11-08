// mmenyene/snap/ScanService.js — snapped pages and the teacher's own handwriting model.
//
// The phone does the reading (mme/ocr runs in the browser). The server keeps the
// photo, what was read, what the teacher kept, and the labelled glyphs from her
// corrections; and it re-trains her personal model in a background thread.
import fs from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { HttpError } from '../../mme/http/Request.js';
import { classOf } from '../../mme/ocr/Charset.js';

const MIN_TO_TRAIN = 40;

export class ScanService {
  constructor({ scans, samples, models, notebook, dataDir, log = console }) {
    Object.assign(this, { scans, samples, models, notebook, dataDir, log });
    this.jobs = new Map();              // teacherId -> {state, progress, result}
  }

  get modelsDir() { return path.join(this.dataDir, 'models'); }
  get baseModel() { return path.join(this.modelsDir, 'base.bin'); }

  modelInfo(teacher) {
    const active = this.models.active(teacher.id);
    const hasBase = fs.existsSync(this.baseModel);
    return {
      ready: !!active || hasBase,
      url: active ? `/api/ocr/model?v=${active.version}` : hasBase ? `/models/base.bin?v=${fs.statSync(this.baseModel).mtimeMs | 0}` : null,
      personal: active ? { version: active.version, accuracy: active.cer != null ? Math.round((1 - active.cer) * 100) : null, samples: active.samples } : null,
      samples: this.samples.countFor(teacher.id),
      minToTrain: MIN_TO_TRAIN,
      history: this.models.history(teacher.id).map(m => ({ version: m.version, accuracy: m.cer != null ? Math.round((1 - m.cer) * 100) : null, samples: m.samples, active: m.active, created: m.created })),
      job: this.jobs.get(teacher.id) || null
    };
  }

  personalModelFile(teacher) {
    const active = this.models.active(teacher.id);
    const file = active ? path.join(this.dataDir, active.path) : this.baseModel;
    if (!fs.existsSync(file)) throw new HttpError(404, 'no handwriting model yet — run tools/train-seed.js');
    return file;
  }

  /** Words from all of the teacher's notes: the reader expects to see these again. */
  lexiconText(teacher) {
    const rows = this.scans.db.all('SELECT title, topic, body FROM notes WHERE teacher_id = ? ORDER BY updated DESC LIMIT 400', teacher.id);
    return rows.map(r => `${r.title} ${r.topic} ${r.body}`).join('\n').slice(0, 400_000);
  }

  saveScan(teacher, { imageBase64, ocr, modelVersion }) {
    if (!imageBase64) throw new HttpError(400, 'no photo');
    const buf = Buffer.from(String(imageBase64).replace(/^data:image\/\w+;base64,/, ''), 'base64');
    if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new HttpError(400, 'the photo must be a JPEG');
    if (buf.length > 8 * 1024 * 1024) throw new HttpError(413, 'photo too large');
    const scan = this.scans.insert({ teacher_id: teacher.id, ocr_json: ocr || null, model_version: modelVersion || null });
    const rel = path.join('pages', String(teacher.id), `${scan.id}.jpg`);
    fs.mkdirSync(path.join(this.dataDir, 'pages', String(teacher.id)), { recursive: true });
    fs.writeFileSync(path.join(this.dataDir, rel), buf);
    return this.scans.update(scan.id, { image_path: rel.replace(/\\/g, '/') });
  }

  scan(teacher, id) {
    const s = this.scans.find(Number(id));
    if (!s || s.teacher_id !== teacher.id) throw new HttpError(404, 'scan not found');
    return s;
  }

  imageFile(teacher, id) {
    const s = this.scan(teacher, id);
    return path.join(this.dataDir, s.image_path);
  }

  /** The teacher accepted the (corrected) text: make or extend a note, keep the samples. */
  accept(teacher, id, { text, teachingId, noteId, title, topic, samples = [] }) {
    const s = this.scan(teacher, id);
    const body = String(text || '').trim();
    if (!body) throw new HttpError(400, 'there is no text to save');
    let note;
    if (noteId) {
      const n = this.notebook.note(teacher, noteId, { write: true });
      note = this.notebook.updateNote(teacher, n.id, { body: (n.body ? n.body.replace(/\s+$/, '') + '\n\n' : '') + body });
    } else {
      note = this.notebook.createNote(teacher, { teachingId, title, topic, body, source: 'ocr' });
    }
    this.scans.update(s.id, { note_id: note.id, final_text: body });
    let added = 0;
    const count = this.samples.countFor(teacher.id);
    this.samples.db.tx(() => {
      for (const smp of samples.slice(0, 1500)) {
        if (!smp || typeof smp.label !== 'string' || classOf(smp.label) < 0) continue;
        const glyph = Buffer.from(String(smp.glyph || ''), 'base64');
        if (glyph.length !== 784) continue;
        this.samples.insert({ teacher_id: teacher.id, label: smp.label, glyph, origin: smp.corrected ? 'correction' : 'confirmed', holdout: (count + added) % 5 === 4 });
        added++;
      }
    });
    return { note, samplesAdded: added, model: this.modelInfo(teacher) };
  }

  /** Re-train her model in a worker thread; promote it only if it reads her writing better. */
  train(teacher) {
    const job = this.jobs.get(teacher.id);
    if (job && job.state === 'running') return job;
    const rows = this.samples.allFor(teacher.id);
    if (rows.length < MIN_TO_TRAIN) throw new HttpError(409, `the model needs at least ${MIN_TO_TRAIN} corrected letters first (you have ${rows.length})`);
    const active = this.models.active(teacher.id);
    const startFrom = active ? path.join(this.dataDir, active.path) : this.baseModel;
    if (!fs.existsSync(startFrom)) throw new HttpError(409, 'there is no starting model — run tools/train-seed.js first');
    const version = (this.models.history(teacher.id).reduce((m, x) => Math.max(m, x.version), 0) || 0) + 1;
    const rel = path.join('models', 'teachers', String(teacher.id), `v${version}.bin`).replace(/\\/g, '/');
    fs.mkdirSync(path.join(this.dataDir, 'models', 'teachers', String(teacher.id)), { recursive: true });

    const state = { state: 'running', progress: 0, started: Date.now(), version };
    this.jobs.set(teacher.id, state);
    const worker = new Worker(fileURLToPath(new URL('./trainWorker.js', import.meta.url)), {
      workerData: {
        startFrom, replay: path.join(this.modelsDir, 'replay.bin'), out: path.join(this.dataDir, rel),
        samples: rows.map(r => ({ label: r.label, glyph: Buffer.from(r.glyph), holdout: !!r.holdout }))
      }
    });
    worker.on('message', (m) => {
      if (m.type === 'progress') state.progress = m.progress;
      if (m.type === 'done') {
        const better = m.accBefore == null || m.accAfter >= m.accBefore - 0.005;
        const rec = this.models.insert({ teacher_id: teacher.id, version, path: rel, cer: m.accAfter != null ? 1 - m.accAfter : null, samples: rows.length });
        if (better) this.models.promote(teacher.id, rec.id);
        Object.assign(state, { state: 'done', progress: 1, promoted: better, accBefore: m.accBefore, accAfter: m.accAfter, holdout: m.holdout });
      }
    });
    worker.on('error', (e) => { this.log.error('[ocr-train]', e); Object.assign(state, { state: 'failed', error: e.message }); });
    worker.on('exit', (code) => { if (state.state === 'running') Object.assign(state, { state: 'failed', error: 'trainer stopped (' + code + ')' }); });
    return state;
  }
}
