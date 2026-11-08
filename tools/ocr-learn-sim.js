// tools/ocr-learn-sim.js — does correcting pages really teach the reader a hand?
//
//   node tools/ocr-learn-sim.js --font mvboli --teach 3 --test 2
//
// Uses a font the seed model never saw as "the teacher's handwriting". Reads --teach
// pages, harvests labelled glyphs from the (perfect) corrections exactly as the Snap
// screen does, fine-tunes a personal model the way the server's trainWorker does,
// then compares error rates on --test fresh pages before and after.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TrueTypeFont } from '../mme/ocr/synth/TrueTypeFont.js';
import { OcrEngine } from '../mme/ocr/OcrEngine.js';
import { Network } from '../mme/ocr/nn/Network.js';
import { PersonalTrainer } from '../mme/ocr/learn/PersonalTrainer.js';
import { CorrectionHarvester } from '../mme/ocr/learn/CorrectionHarvester.js';
import { ReplaySet } from '../mme/ocr/learn/ReplaySet.js';
import { Glyph } from '../mme/ocr/layout/Glyph.js';
import { classOf } from '../mme/ocr/Charset.js';
import { syntheticPage, levenshtein } from './ocr-eval.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const font = new TrueTypeFont(fs.readFileSync(`C:/Windows/Fonts/${arg('font', 'mvboli')}.ttf`));
const words = fs.readFileSync(path.join(ROOT, 'data/lexicon/en.txt'), 'utf8').split(/\r?\n/);
let seed = 777;
const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

const TEXT = `Water is a compound of hydrogen and oxygen. Plants need water light and air to grow. The heart pumps blood to every part of the body.
Bones protect soft organs such as the brain and the lungs. Rocks are made of minerals. Soil forms when rocks break down over many years.
Energy can change from one form to another. Sound travels as waves through solids liquids and gases. The moon goes round the earth.
Magnets attract objects made of iron. Rain falls when water vapour cools in the clouds. Teeth help us to cut tear and grind our food.
Germs can cause diseases so we wash our hands before we eat. Farmers grow crops such as maize yam cassava and rice in our country.
A simple machine makes work easier for people. The lever the pulley and the wheel are simple machines used in many homes.`;
const allLines = [];
for (const para of TEXT.split('\n')) {
  let line = '';
  for (const w of para.trim().split(/\s+/)) { if ((line + ' ' + w).trim().length > 44) { allLines.push(line.trim()); line = w; } else line += ' ' + w; }
  if (line.trim()) allLines.push(line.trim());
}
const page = (k) => allLines.slice((k * 6) % allLines.length, (k * 6) % allLines.length + 6);

const measure = (net, pages) => {
  let c = 0, e = 0;
  for (const p of pages) {
    const eng = new OcrEngine({ net, lexicon: OcrEngine.fromBuffers({ model: net.serialize(), words }).lexicon });
    const truth = p.lines.join(' ').replace(/\s+/g, ' ');
    const got = eng.recognize({ gray: p.img }).text.replace(/\s+/g, ' ').trim();
    c += truth.length; e += levenshtein(truth, got);
  }
  return e / c;
};

const nTeach = Number(arg('teach', 3)), nTest = Number(arg('test', 2));
const mk = (k) => { const lines = page(k); return { lines, img: syntheticPage(font, lines, { tilt: (rng() - 0.5) * 3, rng }) }; };
const teach = Array.from({ length: nTeach }, (_, k) => mk(k));
const test = Array.from({ length: nTest }, (_, k) => mk(nTeach + k));

const base = Network.deserialize(fs.readFileSync(path.join(ROOT, 'data/models/base.bin')));
const before = measure(base, test);
console.log(`unseen hand "${arg('font', 'mvboli')}": CER on ${nTest} fresh pages with the starting model: ${(100 * before).toFixed(1)}%`);

// The teacher corrects the teaching pages → labelled glyphs.
const samples = [];
const h = new CorrectionHarvester();
for (const p of teach) {
  const r = OcrEngine.fromBuffers({ model: fs.readFileSync(path.join(ROOT, 'data/models/base.bin')), words }).recognize({ gray: p.img });
  for (const s of h.harvest(r, p.lines.join('\n'), { keepConfirmed: 1, rng })) samples.push({ px: Glyph.fromBytes(s.glyph), y: classOf(s.label) });
}
console.log(`corrected ${nTeach} pages → ${samples.length} labelled letters of this hand`);

// Fine-tune exactly like mmenyene/snap/trainWorker.js.
const net = base.clone();
new PersonalTrainer({ rng }).train(net, samples, ReplaySet.read(fs.readFileSync(path.join(ROOT, 'data/models/replay.bin'))));
const after = measure(net, test);
console.log(`after learning: CER on the same fresh pages: ${(100 * after).toFixed(1)}%   (${before > after ? 'better' : 'not better'} by ${(100 * (before - after)).toFixed(1)} points)`);

// Diagnostics: letter-level accuracy on the test pages' glyphs (as segmented by the
// starting model), before vs after — separates "reads letters better" from "cuts words differently".
if (process.argv.includes('--diag')) {
  const testGlyphs = [];
  for (const p of test) {
    const r = OcrEngine.fromBuffers({ model: fs.readFileSync(path.join(ROOT, 'data/models/base.bin')), words }).recognize({ gray: p.img });
    for (const s of h.harvest(r, p.lines.join('\n'), { keepConfirmed: 1, rng })) testGlyphs.push({ px: Glyph.fromBytes(s.glyph), y: classOf(s.label) });
  }
  const { Trainer } = await import('../mme/ocr/nn/Trainer.js');
  const { REJECT } = await import('../mme/ocr/Charset.js');
  const rejRate = (n) => testGlyphs.filter(g => { const p = n.predict(g.px); let am = 0; for (let k = 1; k < p.length; k++) if (p[k] > p[am]) am = k; return am === REJECT; }).length / testGlyphs.length;
  console.log(`letters on test pages: ${testGlyphs.length}; accuracy before ${(100 * Trainer.evaluate(base, testGlyphs).acc).toFixed(1)}% → after ${(100 * Trainer.evaluate(net, testGlyphs).acc).toFixed(1)}%; true letters called "not a letter": ${(100 * rejRate(base)).toFixed(1)}% → ${(100 * rejRate(net)).toFixed(1)}%`);
}
