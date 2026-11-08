// mme/ocr/nn/Layers.js — a small convolutional network in plain JavaScript.
// Each layer handles one sample at a time (shape [channels, height, width] flattened
// into a Float32Array), remembers what it needs for the backward pass, and
// accumulates gradients until the trainer applies them.

export class Layer {
  constructor() { this.params = []; }          // [{w: Float32Array, g: Float32Array, v: Float32Array}]
  get outShape() { return this.shape; }
  // eslint-disable-next-line no-unused-vars
  forward(x, train) { throw new Error('forward not implemented'); }
  // eslint-disable-next-line no-unused-vars
  backward(dy) { throw new Error('backward not implemented'); }
  spec() { return { type: this.constructor.TYPE }; }
}

function param(n) { return { w: new Float32Array(n), g: new Float32Array(n), v: new Float32Array(n) }; }

function heInit(arr, fanIn, rng) {
  const sd = Math.sqrt(2 / fanIn);
  for (let i = 0; i < arr.length; i++) {
    // Box–Muller
    const u = Math.max(1e-9, rng()), v = rng();
    arr[i] = sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}

export class Conv2D extends Layer {
  static TYPE = 'conv';
  constructor({ inC, outC, k, inH, inW }, rng) {
    super();
    Object.assign(this, { inC, outC, k, inH, inW });
    this.oH = inH - k + 1; this.oW = inW - k + 1;
    this.shape = [outC, this.oH, this.oW];
    this.W = param(outC * inC * k * k); this.B = param(outC);
    this.params = [this.W, this.B];
    if (rng) heInit(this.W.w, inC * k * k, rng);
  }
  spec() { return { type: 'conv', inC: this.inC, outC: this.outC, k: this.k, inH: this.inH, inW: this.inW }; }

  // im2col: unfold every k×k window into a column, so the convolution becomes one
  // dense matrix product with long contiguous inner loops (fast in plain JS).
  im2col(x) {
    const { inC, k, inH, inW, oH, oW } = this;
    const P = oH * oW, R = inC * k * k;
    const cols = this._cols && this._cols.length === R * P ? this._cols : (this._cols = new Float32Array(R * P));
    let r = 0;
    for (let c = 0; c < inC; c++) for (let u = 0; u < k; u++) for (let v = 0; v < k; v++, r++) {
      const row = r * P;
      for (let i = 0; i < oH; i++) {
        const src = c * inH * inW + (i + u) * inW + v, dst = row + i * oW;
        for (let j = 0; j < oW; j++) cols[dst + j] = x[src + j];
      }
    }
    return cols;
  }

  forward(x, train) {
    const { inC, outC, k, oH, oW } = this;
    const P = oH * oW, R = inC * k * k;
    const cols = this.im2col(x);
    if (train) this.cols = cols.slice();
    const w = this.W.w, b = this.B.w;
    const y = new Float32Array(outC * P);
    for (let o = 0; o < outC; o++) {
      const yo = o * P, wo = o * R;
      for (let p = 0; p < P; p++) y[yo + p] = b[o];
      for (let r = 0; r < R; r++) {
        const wt = w[wo + r];
        if (wt === 0) continue;
        const cr = r * P;
        for (let p = 0; p < P; p++) y[yo + p] += wt * cols[cr + p];
      }
    }
    return y;
  }

  backward(dy) {
    const { inC, outC, k, inH, inW, oH, oW } = this;
    const P = oH * oW, R = inC * k * k;
    const cols = this.cols, w = this.W.w, gw = this.W.g, gb = this.B.g;
    const dcols = new Float32Array(R * P);
    for (let o = 0; o < outC; o++) {
      const yo = o * P, wo = o * R;
      let sb = 0;
      for (let p = 0; p < P; p++) sb += dy[yo + p];
      gb[o] += sb;
      for (let r = 0; r < R; r++) {
        const cr = r * P, wt = w[wo + r];
        let s = 0;
        for (let p = 0; p < P; p++) { const d = dy[yo + p]; s += d * cols[cr + p]; dcols[cr + p] += wt * d; }
        gw[wo + r] += s;
      }
    }
    // col2im
    const dx = new Float32Array(inC * inH * inW);
    let r = 0;
    for (let c = 0; c < inC; c++) for (let u = 0; u < k; u++) for (let v = 0; v < k; v++, r++) {
      const row = r * P;
      for (let i = 0; i < oH; i++) {
        const dst = c * inH * inW + (i + u) * inW + v, src = row + i * oW;
        for (let j = 0; j < oW; j++) dx[dst + j] += dcols[src + j];
      }
    }
    return dx;
  }
}

export class ReLU extends Layer {
  static TYPE = 'relu';
  constructor(shape) { super(); this.shape = shape; }
  forward(x) { this.mask = new Uint8Array(x.length); const y = new Float32Array(x.length); for (let i = 0; i < x.length; i++) if (x[i] > 0) { y[i] = x[i]; this.mask[i] = 1; } return y; }
  backward(dy) { const dx = new Float32Array(dy.length); for (let i = 0; i < dy.length; i++) if (this.mask[i]) dx[i] = dy[i]; return dx; }
}

export class MaxPool extends Layer {
  static TYPE = 'pool';
  constructor([c, h, w]) { super(); this.inShape = [c, h, w]; this.shape = [c, h >> 1, w >> 1]; }
  forward(x) {
    const [c, h, w] = this.inShape, oh = h >> 1, ow = w >> 1;
    const y = new Float32Array(c * oh * ow);
    this.arg = new Int32Array(y.length);
    for (let ch = 0; ch < c; ch++) for (let i = 0; i < oh; i++) for (let j = 0; j < ow; j++) {
      let best = -Infinity, bi = 0;
      for (let u = 0; u < 2; u++) for (let v = 0; v < 2; v++) {
        const idx = ch * h * w + (2 * i + u) * w + 2 * j + v;
        if (x[idx] > best) { best = x[idx]; bi = idx; }
      }
      const o = ch * oh * ow + i * ow + j;
      y[o] = best; this.arg[o] = bi;
    }
    return y;
  }
  backward(dy) {
    const [c, h, w] = this.inShape;
    const dx = new Float32Array(c * h * w);
    for (let o = 0; o < dy.length; o++) dx[this.arg[o]] += dy[o];
    return dx;
  }
}

export class Dense extends Layer {
  static TYPE = 'dense';
  constructor({ inN, outN }, rng) {
    super();
    Object.assign(this, { inN, outN });
    this.shape = [outN];
    this.W = param(inN * outN); this.B = param(outN);
    this.params = [this.W, this.B];
    if (rng) heInit(this.W.w, inN, rng);
  }
  spec() { return { type: 'dense', inN: this.inN, outN: this.outN }; }
  forward(x) {
    this.x = x;
    const { inN, outN } = this, w = this.W.w;
    const y = new Float32Array(outN);
    for (let o = 0; o < outN; o++) {
      let s = this.B.w[o];
      const r = o * inN;
      for (let i = 0; i < inN; i++) s += w[r + i] * x[i];
      y[o] = s;
    }
    return y;
  }
  backward(dy) {
    const { inN, outN, x } = this, w = this.W.w, gw = this.W.g;
    const dx = new Float32Array(inN);
    for (let o = 0; o < outN; o++) {
      const d = dy[o];
      if (d === 0) continue;
      this.B.g[o] += d;
      const r = o * inN;
      for (let i = 0; i < inN; i++) { gw[r + i] += d * x[i]; dx[i] += d * w[r + i]; }
    }
    return dx;
  }
}

/** Dropout is applied only while training. */
export class Dropout extends Layer {
  static TYPE = 'dropout';
  constructor(shape, p = 0.25, rng = Math.random) { super(); this.shape = shape; this.p = p; this.rng = rng; }
  spec() { return { type: 'dropout', p: this.p }; }
  forward(x, train) {
    if (!train) { this.mask = null; return x; }
    this.mask = new Float32Array(x.length);
    const y = new Float32Array(x.length), keep = 1 - this.p;
    for (let i = 0; i < x.length; i++) if (this.rng() < keep) { this.mask[i] = 1 / keep; y[i] = x[i] / keep; }
    return y;
  }
  backward(dy) {
    if (!this.mask) return dy;
    const dx = new Float32Array(dy.length);
    for (let i = 0; i < dy.length; i++) dx[i] = dy[i] * this.mask[i];
    return dx;
  }
}

export function softmax(z) {
  let m = -Infinity;
  for (const v of z) if (v > m) m = v;
  const e = new Float32Array(z.length);
  let s = 0;
  for (let i = 0; i < z.length; i++) { e[i] = Math.exp(z[i] - m); s += e[i]; }
  for (let i = 0; i < z.length; i++) e[i] /= s;
  return e;
}
