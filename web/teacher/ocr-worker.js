// web/teacher/ocr-worker.js — runs the OCR off the main thread so the page stays
// responsive on a phone while a notebook page is being read.
import { OcrEngine } from '/mme/ocr/OcrEngine.js';
import { GrayImage } from '/mme/ocr/Image.js';
import { PageDetector } from '/mme/ocr/pipeline/Stages.js';

let engine = null;
let gray = null;

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === 'init') {
      const [model, lex] = await Promise.all([
        fetch(m.modelUrl, { credentials: 'same-origin' }).then(r => { if (!r.ok) throw new Error('could not load the handwriting model'); return r.arrayBuffer(); }),
        fetch('/api/ocr/lexicon', { credentials: 'same-origin' }).then(r => r.json())
      ]);
      engine = OcrEngine.fromBuffers({ model: new Uint8Array(model), words: lex.words, notesText: lex.notes });
      self.postMessage({ type: 'ready', lexicon: engine.lexicon.size });
    } else if (m.type === 'detect') {
      gray = GrayImage.fromRGBA(m.rgba, m.width, m.height);
      const ctx = { gray };
      new PageDetector().run(ctx);
      self.postMessage({ type: 'detected', quad: ctx.quad || null });
    } else if (m.type === 'read') {
      const r = engine.recognize({ gray }, { quad: m.quad, onProgress: (p) => self.postMessage({ type: 'progress', ...p }) });
      const page = new Uint8ClampedArray(r.page.data.length);
      for (let i = 0; i < page.length; i++) page[i] = r.page.data[i] * 255;
      const transfer = [page.buffer];
      for (const l of r.lines) for (const w of l.words) for (const g of w.glyphs) transfer.push(g.px.buffer);
      self.postMessage({ type: 'result', width: r.width, height: r.height, angle: r.angle, page, lines: r.lines, text: r.text }, transfer);
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message || String(err) });
  }
};
