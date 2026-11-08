// mme/ocr/learn/ReplaySet.js — a compact file of labelled glyphs: per sample one class
// byte followed by 784 grey bytes.
import { SIZE } from '../layout/Glyph.js';

const N = SIZE * SIZE;

export class ReplaySet {
  static write(samples) {
    const out = new Uint8Array(samples.length * (N + 1));
    samples.forEach((s, i) => {
      out[i * (N + 1)] = s.y;
      for (let k = 0; k < N; k++) out[i * (N + 1) + 1 + k] = Math.round(s.px[k] * 255);
    });
    return out;
  }
  static read(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const out = [];
    for (let p = 0; p + N + 1 <= u8.length; p += N + 1) {
      const px = new Float32Array(N);
      for (let k = 0; k < N; k++) px[k] = u8[p + 1 + k] / 255;
      out.push({ y: u8[p], px });
    }
    return out;
  }
}
