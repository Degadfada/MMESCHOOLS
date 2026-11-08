// tools/fetch-emnist.js — add real handwriting (EMNIST, from NIST) to the seed data.
//
//   node tools/fetch-emnist.js [--zip path/to/gzip.zip] [--max 60000]
//   node tools/train-seed.js --emnist
//
// Downloads NIST's EMNIST archive once (~560 MB) unless --zip points at a copy, reads
// the "balanced" split (47 classes, the same scheme as our Charset), re-normalises each
// letter exactly the way the reader normalises a photographed letter, and writes
// data/emnist/emnist-normalised.bin. This is data, not code: nothing is installed.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import { ZipReader } from '../mme/docs/Zip.js';
import { Glyph } from '../mme/ocr/layout/Glyph.js';
import { classOf } from '../mme/ocr/Charset.js';
import { ReplaySet } from '../mme/ocr/learn/ReplaySet.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL = 'https://biometrics.nist.gov/cs_links/EMNIST/gzip.zip';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const dir = path.join(ROOT, 'data', 'emnist');
fs.mkdirSync(dir, { recursive: true });

function download(url, to, hops = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'mmeschools-setup' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 5) { res.resume(); return resolve(download(new globalThis.URL(res.headers.location, url).href, to, hops + 1)); }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      const total = Number(res.headers['content-length']) || 0;
      let got = 0;
      const out = fs.createWriteStream(to);
      res.on('data', (c) => { got += c.length; if (total) process.stdout.write(`\r  downloading ${(got / 1e6).toFixed(0)} / ${(total / 1e6).toFixed(0)} MB`); });
      res.pipe(out);
      out.on('finish', () => out.close(() => { process.stdout.write('\n'); resolve(); }));
      out.on('error', reject);
    }).on('error', reject);
  });
}

/** IDX files: big-endian header, then raw bytes. */
function idx(buf) {
  const dims = buf[3];
  const shape = [];
  for (let i = 0; i < dims; i++) shape.push(buf.readUInt32BE(4 + i * 4));
  return { shape, data: buf.subarray(4 + dims * 4) };
}

let zipPath = arg('zip');
if (!zipPath) {
  zipPath = path.join(dir, 'gzip.zip');
  if (!fs.existsSync(zipPath)) { await download(URL, zipPath + '.part'); fs.renameSync(zipPath + '.part', zipPath); }
}
console.log('  reading', zipPath);
const zip = new ZipReader(fs.readFileSync(zipPath));
const find = (suffix) => [...zip.entries.keys()].find(k => k.endsWith(suffix));
const images = idx(zlib.gunzipSync(zip.read(find('emnist-balanced-train-images-idx3-ubyte.gz'))));
const labels = idx(zlib.gunzipSync(zip.read(find('emnist-balanced-train-labels-idx1-ubyte.gz'))));
const mapping = new Map(zip.read(find('emnist-balanced-mapping.txt')).toString().trim().split(/\r?\n/).map(l => l.trim().split(/\s+/).map(Number)).map(([k, c]) => [k, String.fromCharCode(c)]));

const [n, h, w] = images.shape;
const max = Math.min(n, Number(arg('max', 60000)));
const out = [];
for (let i = 0; i < max; i++) {
  const ch = mapping.get(labels.data[i]);
  const y = classOf(ch);
  if (y < 0) continue;
  const base = i * h * w;
  // EMNIST images are stored transposed (column-major): pixel (x, y) is at [x * w + y].
  const get = (x, yy) => images.data[base + x * w + yy] / 255;
  out.push({ px: Glyph.normalize(get, 0, 0, w - 1, h - 1), y });
  if (i % 5000 === 0) process.stdout.write(`\r  normalising ${i}/${max}`);
}
fs.writeFileSync(path.join(dir, 'emnist-normalised.bin'), ReplaySet.write(out));
console.log(`\n  wrote ${out.length} glyphs to data/emnist/emnist-normalised.bin — now run: node tools/train-seed.js --emnist`);
