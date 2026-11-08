// mme/ocr/nn/Network.js — the character recogniser: 28×28 glyph → class probabilities.
// Serialises to a compact binary (JSON header + float32 weights) that the phone
// downloads once.
import { Conv2D, ReLU, MaxPool, Dense, Dropout, softmax } from './Layers.js';
import { CHARSET } from '../Charset.js';

function mulberry(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export class Network {
  constructor(layers, meta = {}) { this.layers = layers; this.meta = { classes: CHARSET, ...meta }; }

  /** 28×28 → conv5(10) → relu → pool → conv5(20) → relu → pool → dense(128) → relu → dropout → dense(classes)
   *  Small on purpose: a page has thousands of candidate glyphs and this runs on a phone. */
  static create(nClasses = CHARSET.length, seed = 1) {
    const rng = mulberry(seed);
    const c1 = new Conv2D({ inC: 1, outC: 10, k: 5, inH: 28, inW: 28 }, rng);
    const r1 = new ReLU(c1.shape), p1 = new MaxPool(c1.shape);
    const c2 = new Conv2D({ inC: 10, outC: 20, k: 5, inH: 12, inW: 12 }, rng);
    const r2 = new ReLU(c2.shape), p2 = new MaxPool(c2.shape);
    const d1 = new Dense({ inN: 20 * 4 * 4, outN: 128 }, rng);
    const r3 = new ReLU([128]), dr = new Dropout([128], 0.3, rng);
    const d2 = new Dense({ inN: 128, outN: nClasses }, rng);
    return new Network([c1, r1, p1, c2, r2, p2, d1, r3, dr, d2]);
  }

  get params() { return this.layers.flatMap(l => l.params); }

  logits(x, train = false) {
    let h = x;
    for (const l of this.layers) h = l.forward(h, train);
    return h;
  }

  predict(x) { return softmax(this.logits(x, false)); }

  /** Top-k [{cls, ch, p}] for one glyph. */
  top(x, k = 5) {
    const p = this.predict(x);
    const idx = [...p.keys()].sort((a, b) => p[b] - p[a]).slice(0, k);
    return idx.map(i => ({ cls: i, ch: this.meta.classes[i], p: p[i] }));
  }

  backward(dLogits) {
    let d = dLogits;
    for (let i = this.layers.length - 1; i >= 0; i--) d = this.layers[i].backward(d);
  }

  // ── persistence ───────────────────────────────────────────────────────────
  serialize() {
    const spec = this.layers.map(l => l.spec());
    const header = new TextEncoder().encode(JSON.stringify({ spec, meta: this.meta }));
    const weights = this.params.map(p => p.w);
    const n = weights.reduce((a, w) => a + w.length, 0);
    const pad = (4 - ((4 + header.length) % 4)) % 4;
    const buf = new ArrayBuffer(4 + header.length + pad + n * 4);
    new DataView(buf).setUint32(0, header.length, true);
    new Uint8Array(buf, 4, header.length).set(header);
    const f = new Float32Array(buf, 4 + header.length + pad, n);
    let o = 0;
    for (const w of weights) { f.set(w, o); o += w.length; }
    return new Uint8Array(buf);
  }

  static deserialize(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const copy = u8.byteOffset % 4 === 0 ? u8 : u8.slice();
    const dv = new DataView(copy.buffer, copy.byteOffset, copy.byteLength);
    const hl = dv.getUint32(0, true);
    const { spec, meta } = JSON.parse(new TextDecoder().decode(copy.subarray(4, 4 + hl)));
    const pad = (4 - ((4 + hl) % 4)) % 4;
    const layers = [];
    let shape = [1, 28, 28];
    for (const s of spec) {
      let l;
      if (s.type === 'conv') l = new Conv2D(s);
      else if (s.type === 'relu') l = new ReLU(shape);
      else if (s.type === 'pool') l = new MaxPool(shape);
      else if (s.type === 'dense') l = new Dense(s);
      else if (s.type === 'dropout') l = new Dropout(shape, s.p);
      layers.push(l); shape = l.shape;
    }
    const net = new Network(layers, meta);
    const start = copy.byteOffset + 4 + hl + pad;
    let o = 0;
    for (const p of net.params) {
      p.w.set(new Float32Array(copy.buffer.slice(start + o * 4, start + (o + p.w.length) * 4)));
      o += p.w.length;
    }
    return net;
  }

  clone() { return Network.deserialize(this.serialize()); }
}
