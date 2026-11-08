// tools/ocr-eval.js — measure the reader end to end.
//
//   node tools/ocr-eval.js                      synthetic notebook pages (fonts on this PC)
//   node tools/ocr-eval.js --dir photos/        real photos: page1.jpg + page1.txt (truth)
//                                               (photos must be pre-converted to .pgm/.gray;
//                                                see --help)
//   --model data/models/teachers/1/v3.bin       evaluate a personal model
//   --font Inkfree  --pages 3  --nolex
//
// Reports character error rate (CER) and word error rate (WER) per page.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TrueTypeFont } from '../mme/ocr/synth/TrueTypeFont.js';
import { GlyphSynth } from '../mme/ocr/synth/GlyphSynth.js';
import { GrayImage } from '../mme/ocr/Image.js';
import { OcrEngine } from '../mme/ocr/OcrEngine.js';
import { BASIC_SCIENCE, SOCIAL_STUDIES } from '../tests/fixtures/notes.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true) : d; };

export function levenshtein(a, b) {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
const norm = (s) => s.replace(/\s+/g, ' ').trim();

let seed = 4242;
const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

/** Draw lines of text like a notebook page photo: ruled lines, tilt, shadow, noise. */
export function syntheticPage(font, lines, { px = 46, width = 1500, tilt = 1.5, rng: r = rng } = {}) {
  const synth = new GlyphSynth([{ font }], r);
  const lineGap = Math.round(px * 1.7), margin = 90;
  const H = margin * 2 + lineGap * lines.length;
  const g = new GrayImage(width, H);
  // Paper with a shadow gradient and faint blue ruled lines (they come out light grey).
  for (let y = 0; y < H; y++) for (let x = 0; x < width; x++) g.data[y * width + x] = 0.93 - 0.18 * (x / width) * (y / H);
  for (let k = 0; k <= lines.length; k++) {
    const y = margin + k * lineGap + Math.round(px * 0.35);
    for (let x = 0; x < width; x++) for (let t = 0; t < 2; t++) if (y + t < H) g.data[(y + t) * width + x] *= 0.78;
  }
  for (let x = 0; x < H; x++) { const mx = 70; for (let t = 0; t < 2; t++) g.data[x * width + mx + t] *= 0.8; }
  lines.forEach((text, i) => {
    const hand = synth.hand();
    hand.rot = (r() - 0.5) * 0.02;
    const rr = synth.renderText(font, text, px, hand);
    if (!rr) return;
    const top = margin + i * lineGap + Math.round(px * 0.35) - Math.round(rr.baselineY);
    for (let y = 0; y < rr.H; y++) for (let x = 0; x < rr.W; x++) {
      if (!rr.bmp[y * rr.W + x]) continue;
      const X = 110 + x, Y = top + y;
      if (X < width && Y >= 0 && Y < H) g.data[Y * width + X] = 0.12 + r() * 0.08;
    }
  });
  for (let i = 0; i < g.data.length; i++) g.data[i] = Math.min(1, Math.max(0, g.data[i] + (r() - 0.5) * 0.06));
  return tilt ? g.rotate((tilt * Math.PI) / 180) : g;
}

function wrapText(text, maxChars) {
  const out = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const w of para.replace(/^[#\-\d.]+\s*/, '').split(/\s+/).filter(Boolean)) {
      if ((line + ' ' + w).trim().length > maxChars) { out.push(line.trim()); line = w; } else line += ' ' + w;
    }
    if (line.trim()) out.push(line.trim());
  }
  return out;
}

if (process.argv[1] && process.argv[1].endsWith('ocr-eval.js')) {
  const modelPath = arg('model', path.join(ROOT, 'data', 'models', 'base.bin'));
  const words = fs.readFileSync(path.join(ROOT, 'data', 'lexicon', 'en.txt'), 'utf8').split(/\r?\n/).filter(Boolean);
  const fontName = arg('font', 'Inkfree');
  const font = new TrueTypeFont(fs.readFileSync(`C:/Windows/Fonts/${fontName}.ttf`));
  const pages = Number(arg('pages', 2));
  const allNotes = [...BASIC_SCIENCE, ...SOCIAL_STUDIES];
  // The lexicon gets the notes of OTHER topics only — the page itself is new writing.
  let totC = 0, totE = 0, totW = 0, totWE = 0;
  for (let p = 0; p < pages; p++) {
    const note = allNotes[p % allNotes.length];
    const notesText = arg('nolex', false) ? '' : allNotes.filter(n => n !== note).map(n => n.body).join('\n');
    const engine = OcrEngine.fromBuffers({ model: fs.readFileSync(modelPath), words, notesText });
    const lines = wrapText(note.body, 48).slice(0, 12);
    const page = syntheticPage(font, lines, { tilt: (rng() - 0.5) * 4 });
    const t0 = Date.now();
    const r = engine.recognize({ gray: page });
    const truth = norm(lines.join(' ')), got = norm(r.text);
    const e = levenshtein(truth, got);
    const tw = truth.split(' '), gw = got.split(' ');
    const we = levenshtein(tw, gw);
    totC += truth.length; totE += e; totW += tw.length; totWE += we;
    console.log(`page ${p + 1} (${fontName}, ${lines.length} lines, ${((Date.now() - t0) / 1000).toFixed(1)}s): CER ${(100 * e / truth.length).toFixed(1)}%  WER ${(100 * we / tw.length).toFixed(1)}%  angle ${r.angle.toFixed(2)}°`);
    if (arg('show', false)) { console.log('  truth:', lines.slice(0, 3).join(' | ')); console.log('  read :', r.text.split('\n').slice(0, 3).join(' | ')); }
  }
  console.log(`\nOVERALL  CER ${(100 * totE / totC).toFixed(1)}%   WER ${(100 * totWE / totW).toFixed(1)}%`);
}
