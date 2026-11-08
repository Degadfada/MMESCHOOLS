// mme/ocr/layout/Components.js — connected pieces of ink (8-connected), with their
// boxes; the label map lets us cut out exactly one component's pixels later.

export class Component {
  constructor(id) { this.id = id; this.x0 = Infinity; this.y0 = Infinity; this.x1 = -1; this.y1 = -1; this.area = 0; }
  get w() { return this.x1 - this.x0 + 1; }
  get h() { return this.y1 - this.y0 + 1; }
  get cx() { return (this.x0 + this.x1) / 2; }
  get cy() { return (this.y0 + this.y1) / 2; }
}

export class Components {
  /** @param {import('../Image.js').BinaryImage} bin */
  constructor(bin) {
    this.bin = bin;
    const { w: W, h: H, data } = bin;
    this.labels = new Int32Array(W * H);
    const parent = [0];
    const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    const unite = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); };
    let next = 1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!data[i]) continue;
      const nb = [];
      if (x > 0 && data[i - 1]) nb.push(this.labels[i - 1]);
      if (y > 0) {
        if (data[i - W]) nb.push(this.labels[i - W]);
        if (x > 0 && data[i - W - 1]) nb.push(this.labels[i - W - 1]);
        if (x < W - 1 && data[i - W + 1]) nb.push(this.labels[i - W + 1]);
      }
      if (!nb.length) { parent.push(next); this.labels[i] = next++; continue; }
      let m = nb[0];
      for (const l of nb) if (l < m) m = l;
      this.labels[i] = m;
      for (const l of nb) unite(m, l);
    }
    const byRoot = new Map();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!this.labels[i]) continue;
      const r = find(this.labels[i]);
      this.labels[i] = r;
      let c = byRoot.get(r);
      if (!c) { c = new Component(r); byRoot.set(r, c); }
      c.area++;
      if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x;
      if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
    }
    this.list = [...byRoot.values()];
    this.byId = byRoot;
  }

  /** Drop specks and huge blobs (stains, drawings, leftover lines). */
  clean() {
    const sizable = this.list.filter(c => c.area >= 12).map(c => c.h).sort((a, b) => a - b);
    const medH = sizable.length ? sizable[Math.floor(sizable.length / 2)] : 10;
    this.medianHeight = medH;
    const W = this.bin.w;
    this.list = this.list.filter(c =>
      c.area >= Math.max(4, medH * medH * 0.01) &&
      c.h <= medH * 6 && c.w <= W * 0.5 &&
      !(c.w > medH * 8 && c.h < medH * 0.35));       // a stray underline
    return this;
  }
}
