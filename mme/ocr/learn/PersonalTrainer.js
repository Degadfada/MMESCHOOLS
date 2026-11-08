// mme/ocr/learn/PersonalTrainer.js — fine-tune a model on one teacher's corrected
// letters without breaking what it already knows.
//
// Three things keep the fine-tune honest:
//   * replay: seed glyphs are mixed in, so printed letters are not forgotten;
//   * her own "not a letter" samples (two of her letters side by side, half of one),
//     so the reject class — which the decoder relies on to cut words into letters —
//     stays calibrated for her hand;
//   * a small learning rate over few epochs.
import { Trainer } from '../nn/Trainer.js';
import { Glyph, SIZE } from './../layout/Glyph.js';
import { REJECT } from '../Charset.js';

export class PersonalTrainer {
  constructor({ rng = Math.random, epochs = 3, lr = 0.003 } = {}) { Object.assign(this, { rng, epochs, lr }); }

  /** Two glyphs side by side, or the left/right part of one → "not one letter". */
  rejects(samples, n) {
    const out = [];
    if (samples.length < 2) return out;
    const pick = () => samples[Math.floor(this.rng() * samples.length)].px;
    for (let i = 0; i < n; i++) {
      const W = SIZE * 2, img = new Float32Array(W * SIZE);
      if (this.rng() < 0.6) {
        const a = pick(), b = pick(), overlap = Math.floor(this.rng() * 6);
        for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
          img[y * W + x] = Math.max(img[y * W + x], a[y * SIZE + x]);
          const x2 = x + SIZE - overlap;
          img[y * W + x2] = Math.max(img[y * W + x2], b[y * SIZE + x]);
        }
        out.push({ px: Glyph.normalize((x, y) => img[y * W + x], 0, 0, W - 1, SIZE - 1), y: REJECT });
      } else {
        const a = pick(), cut = 9 + Math.floor(this.rng() * 10), left = this.rng() < 0.5;
        out.push({ px: Glyph.normalize((x, y) => a[y * SIZE + x], left ? 0 : cut, 0, left ? cut : SIZE - 1, SIZE - 1), y: REJECT });
      }
    }
    return out;
  }

  /** @param net Network (modified in place) @param mine [{px,y}] @param replay [{px,y}] */
  train(net, mine, replay, onProgress) {
    const shuffled = replay.slice().sort(() => this.rng() - 0.5);
    const replayN = Math.min(shuffled.length, Math.max(1200, mine.length * 4));
    const data = shuffled.slice(0, replayN);
    const reps = Math.max(1, Math.min(6, Math.round(1200 / Math.max(1, mine.length))));
    for (let r = 0; r < reps; r++) data.push(...mine);
    // Her real rejects (harvested wrong cuts) carry most of this; top up synthetically.
    const realRejects = mine.filter(s => s.y === REJECT).length;
    const letters = mine.filter(s => s.y !== REJECT);
    data.push(...this.rejects(letters, Math.max(0, Math.round(mine.length * reps * 0.12) - realRejects * reps)));
    for (let e = 0; e < this.epochs; e++) {
      new Trainer(net, { lr: this.lr * Math.pow(0.6, e), rng: this.rng }).epoch(data, (n, total) => onProgress && onProgress((e + n / total) / this.epochs));
    }
    return net;
  }
}
