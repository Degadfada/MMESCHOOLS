// tools/train-seed.js — train the starting handwriting model.
//
//   node tools/train-seed.js [--per 240] [--epochs 6] [--emnist]
//
// Training glyphs are synthesised from the handwriting-style fonts on this computer
// (no download). If tools/fetch-emnist.js has been run, real handwriting from the
// EMNIST dataset is mixed in with --emnist. Writes:
//   data/models/base.bin    the model every teacher starts with
//   data/models/replay.bin  a sample of the seed data, mixed into personal re-training
//                           so a teacher's model never forgets the basics
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TrueTypeFont } from '../mme/ocr/synth/TrueTypeFont.js';
import { GlyphSynth } from '../mme/ocr/synth/GlyphSynth.js';
import { Network } from '../mme/ocr/nn/Network.js';
import { Trainer } from '../mme/ocr/nn/Trainer.js';
import { CHARSET } from '../mme/ocr/Charset.js';
import { ReplaySet } from '../mme/ocr/learn/ReplaySet.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true) : d; };
const PER = Number(arg('per', 240)), EPOCHS = Number(arg('epochs', 6));

const FONT_DIRS = ['C:/Windows/Fonts', '/usr/share/fonts/truetype', '/Library/Fonts', path.join(ROOT, 'data', 'fonts')];
// Handwriting-like fonts are listed several times so they dominate the mix.
const WANT = ['Inkfree', 'Inkfree', 'Inkfree', 'segoepr', 'segoepr', 'segoeprb', 'segoesc', 'comic', 'comic', 'comici', 'comicbd',
  'Gabriola', 'arial', 'ariali', 'calibri', 'calibrii', 'georgia', 'verdana', 'tahoma', 'trebuc', 'times', 'cour', 'consola', 'segoeui',
  'LHANDW', 'BRADHITC', 'ITCKRIST', 'MISTRAL', 'FRSCRIPT', 'VINERITC', 'PRISTINA'];

let seed = 12345;
const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

function loadFonts() {
  const fonts = [];
  for (const name of WANT) {
    for (const dir of FONT_DIRS) {
      const f = path.join(dir, name + '.ttf');
      if (!fs.existsSync(f)) continue;
      try { fonts.push({ name, font: new TrueTypeFont(fs.readFileSync(f)) }); } catch { /* CFF or odd font: skip */ }
      break;
    }
  }
  return fonts;
}

function loadEmnist() {
  const file = path.join(ROOT, 'data', 'emnist', 'emnist-normalised.bin');
  if (!fs.existsSync(file)) { console.log('  (no EMNIST data — run tools/fetch-emnist.js to add real handwriting)'); return []; }
  return ReplaySet.read(fs.readFileSync(file));
}

const fonts = loadFonts();
if (!fonts.length) { console.error('No usable fonts found. Put .ttf files in data/fonts/.'); process.exit(1); }
console.log(`fonts: ${[...new Set(fonts.map(f => f.name))].join(', ')}`);
const synth = new GlyphSynth(fonts, rng);
let t0 = Date.now();
const train = synth.dataset(PER, 0.12, (n, total) => process.stdout.write(`\r  synthesising ${n}/${total}`));
const test = synth.dataset(Math.max(20, Math.round(PER / 8)), 0.12);
console.log(`\n  ${train.length} training, ${test.length} test glyphs in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (arg('emnist', false)) {
  const em = loadEmnist().sort(() => rng() - 0.5).slice(0, Number(arg('emnist-max', 25000)));
  const cut = Math.floor(em.length * 0.95);
  train.push(...em.slice(0, cut)); test.push(...em.slice(cut));
  console.log(`  + ${em.length} EMNIST glyphs`);
}

const net = Network.create(CHARSET.length, 7);
for (let e = 1; e <= EPOCHS; e++) {
  const lr = 0.02 * Math.pow(0.6, e - 1);
  const tr = new Trainer(net, { lr, rng, batch: 32 });
  t0 = Date.now();
  const r = tr.epoch(train, (n, total) => { if (n % 3200 < 32) process.stdout.write(`\r  epoch ${e}: ${n}/${total}`); });
  const ev = Trainer.evaluate(net, test);
  console.log(`\r  epoch ${e}: loss ${r.loss.toFixed(3)}  train ${(100 * r.acc).toFixed(1)}%  test ${(100 * ev.acc).toFixed(1)}%  (${((Date.now() - t0) / 1000).toFixed(0)}s, lr ${lr.toFixed(4)})`);
}

const dir = path.join(ROOT, 'data', 'models');
fs.mkdirSync(dir, { recursive: true });
net.meta = { ...net.meta, version: 0, trained: new Date().toISOString(), fonts: [...new Set(fonts.map(f => f.name))], samples: train.length };
const outFile = arg('out', path.join(dir, 'base.bin'));
fs.writeFileSync(outFile, net.serialize());
const replay = [];
for (let i = 0; i < Math.min(6000, train.length); i++) replay.push(train[Math.floor(rng() * train.length)]);
if (!arg('out')) fs.writeFileSync(path.join(dir, 'replay.bin'), ReplaySet.write(replay));
console.log(`saved ${outFile} (${(fs.statSync(outFile).size / 1024).toFixed(0)} KB) and replay.bin`);
