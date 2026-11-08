// mme/ocr/Image.js — the two image types the OCR works on. Plain typed arrays, so the
// same code runs in the browser (on the teacher's phone) and in node (training).
//   GrayImage: Float32, 0 = black, 1 = white
//   BinaryImage: Uint8, 1 = ink, 0 = paper

export class GrayImage {
  constructor(w, h, data) { this.w = w; this.h = h; this.data = data || new Float32Array(w * h).fill(1); }

  static fromRGBA(rgba, w, h) {
    const g = new GrayImage(w, h);
    for (let i = 0, p = 0; i < g.data.length; i++, p += 4) {
      // Luma, but lean on the red channel a little: blue ruled lines and blue-ink
      // margins then fade towards paper while pencil and black/blue pen stay dark.
      g.data[i] = (0.36 * rgba[p] + 0.5 * rgba[p + 1] + 0.14 * rgba[p + 2]) / 255;
    }
    return g;
  }

  get(x, y) {
    x = x < 0 ? 0 : x >= this.w ? this.w - 1 : x;
    y = y < 0 ? 0 : y >= this.h ? this.h - 1 : y;
    return this.data[y * this.w + x];
  }

  sample(x, y) {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    if (x0 < -1 || y0 < -1 || x0 > this.w || y0 > this.h) return 1;
    const a = this.get(x0, y0), b = this.get(x0 + 1, y0), c = this.get(x0, y0 + 1), d = this.get(x0 + 1, y0 + 1);
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }

  /** Area-average when shrinking (no aliasing), bilinear when growing. */
  resize(nw, nh) {
    nw = Math.max(1, Math.round(nw)); nh = Math.max(1, Math.round(nh));
    const out = new GrayImage(nw, nh);
    const sx = this.w / nw, sy = this.h / nh;
    if (sx <= 1 && sy <= 1) {
      for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) out.data[y * nw + x] = this.sample((x + 0.5) * sx - 0.5, (y + 0.5) * sy - 0.5);
      return out;
    }
    for (let y = 0; y < nh; y++) {
      const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
      for (let x = 0; x < nw; x++) {
        const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
        let s = 0, n = 0;
        for (let yy = y0; yy < y1 && yy < this.h; yy++) for (let xx = x0; xx < x1 && xx < this.w; xx++) { s += this.data[yy * this.w + xx]; n++; }
        out.data[y * nw + x] = n ? s / n : 1;
      }
    }
    return out;
  }

  fitWithin(maxSide) {
    const s = Math.min(1, maxSide / Math.max(this.w, this.h));
    return s < 1 ? { img: this.resize(this.w * s, this.h * s), scale: s } : { img: this, scale: 1 };
  }

  /** Rotate about the centre by `rad`, same canvas size, white outside. */
  rotate(rad) {
    const out = new GrayImage(this.w, this.h);
    const c = Math.cos(rad), s = Math.sin(rad), cx = this.w / 2, cy = this.h / 2;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const dx = x - cx, dy = y - cy;
      const sx = c * dx + s * dy + cx, sy = -s * dx + c * dy + cy;
      out.data[y * this.w + x] = (sx < 0 || sy < 0 || sx > this.w - 1 || sy > this.h - 1) ? 1 : this.sample(sx, sy);
    }
    return out;
  }

  /** Summed-area tables of value and value², for O(1) window statistics. */
  integrals() {
    const W = this.w + 1;
    const sum = new Float64Array(W * (this.h + 1)), sq = new Float64Array(W * (this.h + 1));
    for (let y = 0; y < this.h; y++) {
      let rs = 0, rq = 0;
      for (let x = 0; x < this.w; x++) {
        const v = this.data[y * this.w + x];
        rs += v; rq += v * v;
        sum[(y + 1) * W + x + 1] = sum[y * W + x + 1] + rs;
        sq[(y + 1) * W + x + 1] = sq[y * W + x + 1] + rq;
      }
    }
    return { sum, sq, W };
  }

  toRGBA() {
    const out = new Uint8ClampedArray(this.w * this.h * 4);
    for (let i = 0; i < this.data.length; i++) {
      const v = Math.round(this.data[i] * 255);
      out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v; out[i * 4 + 3] = 255;
    }
    return out;
  }
}

export class BinaryImage {
  constructor(w, h, data) { this.w = w; this.h = h; this.data = data || new Uint8Array(w * h); }
  at(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.data[y * this.w + x] : 0; }
  count() { let n = 0; for (const v of this.data) n += v; return n; }
  clone() { return new BinaryImage(this.w, this.h, this.data.slice()); }
}

/** Otsu's threshold on values in 0..1. */
export function otsu(values) {
  const hist = new Float64Array(256);
  for (const v of values) hist[Math.max(0, Math.min(255, Math.round(v * 255)))]++;
  const total = values.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, t = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i]; if (!wB) continue;
    const wF = total - wB; if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; t = i; }
  }
  return t / 255;
}
