// mme/ocr/nn/Trainer.js — mini-batch SGD with momentum and weight decay, softmax
// cross-entropy loss, light on-the-fly augmentation (shift, rotate, scale, thickness).
import { softmax } from './Layers.js';
import { SIZE } from '../layout/Glyph.js';

export class Augmenter {
  constructor(rng) { this.rng = rng; }
  apply(px) {
    const r = this.rng;
    const ang = (r() - 0.5) * 0.3, sc = 0.88 + r() * 0.24, sx = (r() - 0.5) * 3, sy = (r() - 0.5) * 3, shear = (r() - 0.5) * 0.4;
    const c = Math.cos(ang) / sc, s = Math.sin(ang) / sc, m = SIZE / 2;
    const out = new Float32Array(SIZE * SIZE);
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const dx = x - m - sx, dy = y - m - sy;
      const u = c * dx + s * dy + shear * dy + m, v = -s * dx + c * dy + m;
      const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
      const g = (a, b) => (a >= 0 && b >= 0 && a < SIZE && b < SIZE ? px[b * SIZE + a] : 0);
      out[y * SIZE + x] = (g(x0, y0) * (1 - fx) + g(x0 + 1, y0) * fx) * (1 - fy) + (g(x0, y0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1) * fx) * fy;
    }
    // Thicker or thinner pen.
    const t = r();
    if (t < 0.2) return Augmenter.morph(out, Math.max);
    if (t < 0.35) return Augmenter.morph(out, Math.min);
    return out;
  }
  static morph(px, op) {
    const out = new Float32Array(px.length);
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      let v = px[y * SIZE + x];
      if (x > 0) v = op(v, px[y * SIZE + x - 1]);
      if (y > 0) v = op(v, px[(y - 1) * SIZE + x]);
      out[y * SIZE + x] = v;
    }
    return out;
  }
}

export class Trainer {
  constructor(net, { lr = 0.01, momentum = 0.9, decay = 1e-4, batch = 32, rng = Math.random, augment = true } = {}) {
    Object.assign(this, { net, lr, momentum, decay, batch, rng });
    this.aug = augment ? new Augmenter(rng) : null;
  }

  /** samples: [{px: Float32Array(784), y: classIndex}] */
  epoch(samples, onBatch) {
    const order = samples.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    let loss = 0, right = 0;
    for (let b = 0; b < order.length; b += this.batch) {
      const idx = order.slice(b, b + this.batch);
      for (const i of idx) {
        const s = samples[i];
        const x = this.aug && this.rng() < 0.8 ? this.aug.apply(s.px) : s.px;
        const z = this.net.logits(x, true);
        const p = softmax(z);
        loss -= Math.log(Math.max(1e-9, p[s.y]));
        let am = 0; for (let k = 1; k < p.length; k++) if (p[k] > p[am]) am = k;
        if (am === s.y) right++;
        p[s.y] -= 1;
        this.net.backward(p);
      }
      this.step(idx.length);
      if (onBatch) onBatch(b + idx.length, order.length);
    }
    return { loss: loss / samples.length, acc: right / samples.length };
  }

  step(n) {
    for (const p of this.net.params) {
      for (let i = 0; i < p.w.length; i++) {
        const g = p.g[i] / n + this.decay * p.w[i];
        p.v[i] = this.momentum * p.v[i] - this.lr * g;
        p.w[i] += p.v[i];
        p.g[i] = 0;
      }
    }
  }

  static evaluate(net, samples) {
    if (!samples.length) return { acc: null, n: 0 };
    let right = 0;
    for (const s of samples) {
      const p = net.predict(s.px);
      let am = 0; for (let k = 1; k < p.length; k++) if (p[k] > p[am]) am = k;
      if (am === s.y) right++;
    }
    return { acc: right / samples.length, n: samples.length };
  }
}
