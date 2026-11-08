// Snap a notebook page → the phone reads it → the teacher checks every word → save
// as a note. Every word she fixes becomes a lesson for her personal handwriting model.
import { h, mount, toast, field } from '../../shared/dom.js';
import { api } from '../../shared/api.js';
import { View } from '../View.js';
import { CorrectionHarvester } from '/mme/ocr/learn/CorrectionHarvester.js';
import { classOf } from '/mme/ocr/Charset.js';

const MAX_SIDE = 2000;

function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export class SnapView extends View {
  async render(root) {
    this.root = root;
    this.t = await this.app.teaching(this.params.tid);
    this.app.renderBar([{ label: 'My classes', href: '#/' }, { label: `${this.t.subject} · ${this.t.class_name}`, href: `#/c/${this.t.id}` }, { label: 'Snap pages' }]);
    this.info = await api.get('/api/ocr/info');
    this.queue = [];
    this.onDestroy = () => { if (this.worker) this.worker.terminate(); };
    this.pick();
  }

  // ── step 1: take or choose photos ─────────────────────────────────────────
  pick() {
    if (!this.info.ready) {
      return mount(this.root, h('div.card.empty', h('h2', 'Handwriting model not installed'),
        h('p', 'On the computer running MMESCHOOLS, run: node tools/train-seed.js — it takes a few minutes, once.')));
    }
    const cam = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'hide', onchange: () => this.load([...cam.files]) });
    const lib = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'hide', onchange: () => this.load([...lib.files]) });
    mount(this.root,
      h('div.card.stack', { style: { textAlign: 'center' } },
        h('h1', 'Snap notebook pages'),
        h('p.muted', 'Lay the page flat in good light, fill the frame, hold the phone straight above it.'),
        h('div.row', { style: { justifyContent: 'center' } },
          h('button.primary.big', { onclick: () => cam.click() }, '📷 Take a photo'),
          h('button.big', { onclick: () => lib.click() }, '🖼 Choose photos')),
        cam, lib,
        h('p.muted', { style: { fontSize: '.85rem' } },
          this.info.personal ? `Using your personal handwriting model (v${this.info.personal.version}${this.info.personal.accuracy != null ? `, ${this.info.personal.accuracy}% on your letters` : ''}).`
            : 'Using the starting model. Each page you correct teaches it your handwriting.')));
  }

  async load(files) {
    if (!files.length) return;
    this.queue = files;
    this.pageNo = 0;
    this.next();
  }

  async next() {
    const file = this.queue[this.pageNo];
    if (!file) return this.app.go(`#/c/${this.t.id}`);
    mount(this.root, h('div.card', h('p', 'Opening photo…')));
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(bmp.width * s); cv.height = Math.round(bmp.height * s);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    this.photo = cv;
    // A smaller JPEG is what gets kept on the server with the note.
    const js = Math.min(1, 1600 / Math.max(cv.width, cv.height));
    const jc = document.createElement('canvas');
    jc.width = Math.round(cv.width * js); jc.height = Math.round(cv.height * js);
    jc.getContext('2d').drawImage(cv, 0, 0, jc.width, jc.height);
    this.jpeg = await new Promise(r => jc.toBlob(r, 'image/jpeg', 0.85));
    await this.ensureWorker();
    const img = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);
    const quad = await this.ask({ type: 'detect', rgba: img.data, width: cv.width, height: cv.height }, 'detected');
    this.quad = quad.quad || [[0, 0], [cv.width - 1, 0], [cv.width - 1, cv.height - 1], [0, cv.height - 1]];
    this.corners();
  }

  ensureWorker() {
    if (this.workerReady) return this.workerReady;
    this.worker = new Worker('/static/teacher/ocr-worker.js', { type: 'module' });
    this.waiters = [];
    this.worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress' && this.onProgress) return this.onProgress(m);
      if (m.type === 'error') { toast('Could not read the page: ' + m.message, { bad: true }); const w = this.waiters.shift(); if (w) w.reject(new Error(m.message)); return; }
      const i = this.waiters.findIndex(w => w.type === m.type);
      if (i >= 0) this.waiters.splice(i, 1)[0].resolve(m);
    };
    this.workerReady = this.ask({ type: 'init', modelUrl: this.info.url }, 'ready');
    return this.workerReady;
  }

  ask(msg, replyType, transfer) {
    return new Promise((resolve, reject) => { this.waiters.push({ type: replyType, resolve, reject }); this.worker.postMessage(msg, transfer || []); });
  }

  // ── step 2: check the page corners ────────────────────────────────────────
  corners() {
    const cv = this.photo;
    const stage = h('div.snap-stage');
    const img = h('img', { src: cv.toDataURL('image/jpeg', 0.7), draggable: false });
    stage.appendChild(img);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${cv.width} ${cv.height}`);
    Object.assign(svg.style, { position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' });
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('fill', 'rgba(47,85,201,.12)'); poly.setAttribute('stroke', '#2f55c9'); poly.setAttribute('stroke-width', String(Math.max(3, cv.width / 300)));
    svg.appendChild(poly);
    stage.appendChild(svg);
    const redraw = () => poly.setAttribute('points', this.quad.map(p => p.join(',')).join(' '));
    const handles = this.quad.map((p, i) => {
      const el = h('div.handle');
      const place = () => { el.style.left = `${(100 * this.quad[i][0]) / cv.width}%`; el.style.top = `${(100 * this.quad[i][1]) / cv.height}%`; redraw(); };
      el.addEventListener('pointerdown', (e) => {
        el.setPointerCapture(e.pointerId);
        const move = (ev) => {
          const r = stage.getBoundingClientRect();
          this.quad[i] = [Math.max(0, Math.min(cv.width - 1, ((ev.clientX - r.left) / r.width) * cv.width)), Math.max(0, Math.min(cv.height - 1, ((ev.clientY - r.top) / r.height) * cv.height))];
          place();
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', () => el.removeEventListener('pointermove', move), { once: true });
      });
      el.place = place;
      return el;
    });
    handles.forEach(hd => stage.appendChild(hd));
    handles.forEach(hd => hd.place());
    mount(this.root,
      h('div.row.between', h('h2', { style: { margin: 0 } }, `Page ${this.pageNo + 1} of ${this.queue.length}`), h('span.muted', 'Drag the blue dots to the page corners')),
      h('div', { style: { maxWidth: '560px', margin: '10px auto' } }, stage),
      h('div.row', { style: { justifyContent: 'center' } },
        h('button', { onclick: () => this.pick() }, 'Retake'),
        h('button', { onclick: () => { this.quad = [[0, 0], [cv.width - 1, 0], [cv.width - 1, cv.height - 1], [0, cv.height - 1]]; handles.forEach(hd => hd.place()); } }, 'Whole photo'),
        h('button.primary.big', { onclick: () => this.read() }, 'Read this page →')));
  }

  // ── step 3: read ──────────────────────────────────────────────────────────
  async read() {
    const bar = h('i', { style: { width: '2%' } });
    const label = h('p.muted', 'Straightening the page…');
    mount(this.root, h('div.card.stack', { style: { textAlign: 'center' } }, h('h2', 'Reading your page…'), h('div.prog', { style: { height: '12px' } }, bar), label,
      h('p.muted', { style: { fontSize: '.85rem' } }, 'This runs on your phone. A full page can take half a minute.')));
    this.onProgress = (p) => {
      if (p.stage === 'reading') { bar.style.width = `${20 + (80 * p.done) / p.of}%`; label.textContent = `Reading line ${p.done} of ${p.of}`; }
      else { bar.style.width = `${(20 * p.done) / p.of}%`; }
    };
    try {
      this.result = await this.ask({ type: 'read', quad: this.quad }, 'result');
      this.review();
    } catch { this.corners(); }
  }

  // ── step 4: check every word ──────────────────────────────────────────────
  review() {
    const r = this.result;
    const page = document.createElement('canvas');
    page.width = r.width; page.height = r.height;
    const ctx = page.getContext('2d');
    const id = ctx.createImageData(r.width, r.height);
    for (let i = 0; i < r.page.length; i++) { id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = r.page[i]; id.data[i * 4 + 3] = 255; }
    ctx.putImageData(id, 0, 0);
    this.pageCanvas = page;
    const overlay = page.cloneNode(); const octx = overlay.getContext('2d');
    octx.drawImage(page, 0, 0);
    octx.lineWidth = Math.max(2, r.width / 500);
    this.words = [];
    for (const line of r.lines) for (const w of line.words) {
      octx.strokeStyle = w.conf < 0.5 ? '#d97706' : w.conf < 0.8 ? '#94a3b8' : '#10b981';
      octx.strokeRect(w.box.x, w.box.y, w.box.w, w.box.h);
    }
    this.mode = 'words';
    const crop = h('canvas.crop', { width: 10, height: 10, style: { display: 'none', maxHeight: '90px' } });
    const alts = h('div.row');
    this.cropEl = crop; this.altsEl = alts;
    const textBox = h('div.ocr-text');
    r.lines.forEach((line, li) => {
      const row = h('div.ocr-line');
      line.words.forEach((w, wi) => {
        const el = h('span.w', { contentEditable: 'true', spellcheck: false, class: w.conf < 0.5 ? 'low' : w.conf < 0.8 ? 'mid' : '' }, w.text);
        const rec = { ...w, el, line: li, index: wi };
        el.addEventListener('focus', () => this.focusWord(rec));
        el.addEventListener('input', () => el.classList.toggle('edited', el.textContent.trim() !== w.text));
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const n = this.words[this.words.indexOf(rec) + 1]; if (n) n.el.focus(); } });
        this.words.push(rec);
        row.append(el, ' ');
      });
      textBox.appendChild(row);
    });
    const plain = h('textarea', { class: 'hide', value: r.text, style: { minHeight: '40vh' } });
    this.plain = plain;
    const lowCount = this.words.filter(w => w.conf < 0.5).length;
    mount(this.root,
      h('div.row.between', h('h2', { style: { margin: 0 } }, 'Check the words'),
        h('div.row', h('button.small', { onclick: (e) => this.toggleMode(e.target, textBox) }, 'Edit as plain text'))),
      h('p.muted', lowCount ? `${lowCount} words the reader was unsure of are highlighted. Tap a word to fix it — each fix teaches your handwriting model.` : 'Tap any word to fix it. Each fix teaches your handwriting model.'),
      h('div.row', { style: { alignItems: 'flex-start', gap: '14px' } },
        h('div.card', { style: { flex: '1 1 340px' } }, crop, alts, textBox, plain),
        h('div.card', { style: { flex: '1 1 260px' } }, h('details', h('summary', 'Show the page as the reader saw it'), h('img', { src: overlay.toDataURL('image/jpeg', 0.75), style: { width: '100%', marginTop: '8px', borderRadius: '8px' } })))),
      this.saveForm());
  }

  focusWord(w) {
    const pad = 6, c = this.cropEl;
    c.width = w.box.w + pad * 2; c.height = w.box.h + pad * 2;
    c.getContext('2d').drawImage(this.pageCanvas, w.box.x - pad, w.box.y - pad, c.width, c.height, 0, 0, c.width, c.height);
    c.style.display = 'block';
    mount(this.altsEl, w.alts.length ? [h('span.muted', 'Maybe: '), ...w.alts.map(a => h('button.small', { onmousedown: (e) => e.preventDefault(), onclick: () => { w.el.textContent = a; w.el.classList.toggle('edited', a !== w.text); } }, a))] : []);
  }

  toggleMode(btn, textBox) {
    if (this.mode === 'words') {
      this.plain.value = this.currentText();
      textBox.classList.add('hide'); this.plain.classList.remove('hide');
      this.cropEl.style.display = 'none'; mount(this.altsEl);
      this.mode = 'plain'; btn.textContent = 'Back to word by word';
    } else {
      this.mode = 'words'; textBox.classList.remove('hide'); this.plain.classList.add('hide'); btn.textContent = 'Edit as plain text';
    }
  }

  currentText() {
    if (this.mode === 'plain') return this.plain.value;
    const lines = [];
    for (const w of this.words) {
      lines[w.line] = lines[w.line] || [];
      const t = w.el.textContent.replace(/\s+/g, ' ').trim();
      if (t) lines[w.line].push(t);
    }
    return lines.filter(Boolean).map(l => l.join(' ')).join('\n');
  }

  /** Labelled glyphs from what the teacher changed (and some of what she confirmed). */
  samples() {
    let raw;
    if (this.mode === 'plain') raw = new CorrectionHarvester().harvest(this.result, this.plain.value);
    else {
      raw = [];
      for (const w of this.words) {
        const target = w.el.textContent.trim();
        const corrected = target !== w.text;
        if (!corrected && Math.random() > 0.35) continue;
        if (target.length !== w.glyphs.length) continue;
        [...target].forEach((ch, k) => {
          if (classOf(ch) < 0) return;
          const px = w.glyphs[k].px, bytes = new Uint8Array(784);
          for (let i = 0; i < 784; i++) bytes[i] = Math.round(px[i] * 255);
          raw.push({ label: ch, glyph: bytes, corrected: corrected && w.text[k] !== ch });
        });
      }
    }
    return raw.map(s => ({ label: s.label, corrected: s.corrected, glyph: b64(s.glyph) }));
  }

  saveForm() {
    const title = h('input', { placeholder: 'Title, e.g. Photosynthesis', value: '' });
    const topic = h('input', { placeholder: 'Topic (optional)' });
    const where = h('select', h('option', { value: 'new' }, 'Save as a new note'));
    api.get(`/api/teachings/${this.t.id}/notes`).then(({ notes }) => notes.forEach(n => where.appendChild(h('option', { value: n.id }, `Add to: ${n.title}`))));
    const btn = h('button.primary.big', { onclick: async () => {
      const text = this.currentText().trim();
      if (!text) return toast('There is no text to save', { bad: true });
      btn.disabled = true;
      try {
        const jpegB64 = b64(new Uint8Array(await this.jpeg.arrayBuffer()));
        const ocr = { text: this.result.text, angle: this.result.angle, lines: this.result.lines.map(l => ({ words: l.words.map(w => ({ text: w.text, conf: w.conf, box: w.box })) })) };
        const scan = await api.post('/api/scans', { imageBase64: jpegB64, ocr, modelVersion: this.info.personal ? this.info.personal.version : 0 });
        const res = await api.post(`/api/scans/${scan.id}/accept`, {
          text, teachingId: this.t.id, noteId: where.value === 'new' ? null : Number(where.value),
          title: title.value || null, topic: topic.value || null, samples: this.samples()
        });
        this.app.forget();
        toast(res.samplesAdded ? `Saved. Learned ${res.samplesAdded} letters of your handwriting.` : 'Saved.');
        this.pageNo++;
        if (this.pageNo < this.queue.length) this.next();
        else this.app.go(`#/c/${this.t.id}/note/${res.note.id}`);
      } catch (e) { toast(e.message, { bad: true }); btn.disabled = false; }
    } }, this.queue.length > this.pageNo + 1 ? 'Save & next page →' : 'Save note');
    return h('div.card.stack', { style: { marginTop: '12px' } },
      field('Where should this go?', where),
      h('div.row', h('div', { style: { flex: '2 1 220px' } }, title), h('div', { style: { flex: '1 1 160px' } }, topic)),
      h('div.row', { style: { justifyContent: 'flex-end' } }, h('button', { onclick: () => this.corners() }, '← Back'), btn));
  }
}
