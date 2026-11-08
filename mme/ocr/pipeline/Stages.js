// mme/ocr/pipeline/Stages.js — the preprocessing stages, in the order they run:
//   PageDetector → PerspectiveWarp → IlluminationFlatten → SauvolaBinarize →
//   RuledLineRemover → Deskew
import { Stage } from './Stage.js';
import { GrayImage, BinaryImage, otsu } from '../Image.js';

// ── geometry ────────────────────────────────────────────────────────────────
/** Solve the 8 homography coefficients mapping 4 src points onto 4 dst points. */
export function homography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const n = 8;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    if (Math.abs(A[c][c]) < 1e-12) return null;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const h = b.map((v, i) => v / A[i][i]);
  return [...h, 1];
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// ── 1. find the sheet of paper in the photo ──────────────────────────────────
export class PageDetector extends Stage {
  run(ctx) {
    if (ctx.quad) return;                         // the teacher dragged the corners herself
    const { img: small, scale } = ctx.gray.fitWithin(320);
    const t = otsu(small.data);
    const W = small.w, H = small.h, N = W * H;
    const bright = new Uint8Array(N);
    for (let i = 0; i < N; i++) bright[i] = small.data[i] > t ? 1 : 0;
    // Largest bright 4-connected region = the page.
    const seen = new Uint8Array(N);
    let best = null;
    const stack = new Int32Array(N);
    for (let s = 0; s < N; s++) {
      if (!bright[s] || seen[s]) continue;
      let sp = 0, area = 0;
      let tl = [0, 0, Infinity], br = [0, 0, -Infinity], tr = [0, 0, -Infinity], bl = [0, 0, Infinity];
      stack[sp++] = s; seen[s] = 1;
      while (sp) {
        const p = stack[--sp], x = p % W, y = (p - x) / W;
        area++;
        if (x + y < tl[2]) tl = [x, y, x + y];
        if (x + y > br[2]) br = [x, y, x + y];
        if (x - y > tr[2]) tr = [x, y, x - y];
        if (x - y < bl[2]) bl = [x, y, x - y];
        const nb = [p - 1, p + 1, p - W, p + W];
        if (x === 0) nb[0] = -1; if (x === W - 1) nb[1] = -1;
        for (const q of nb) if (q >= 0 && q < N && bright[q] && !seen[q]) { seen[q] = 1; stack[sp++] = q; }
      }
      if (!best || area > best.area) best = { area, quad: [tl, tr, br, bl].map(([x, y]) => [x, y]) };
    }
    ctx.quadArea = best ? best.area / N : 0;
    if (!best || best.area < 0.2 * N) return;          // can't see a page edge: use the whole photo
    // Shrinking the quad's area relative to the photo tells us if the page fills the frame.
    const q = best.quad;
    const quadArea = Math.abs((q[0][0] * q[1][1] - q[1][0] * q[0][1]) + (q[1][0] * q[2][1] - q[2][0] * q[1][1]) +
      (q[2][0] * q[3][1] - q[3][0] * q[2][1]) + (q[3][0] * q[0][1] - q[0][0] * q[3][1])) / 2;
    if (quadArea > 0.9 * N || quadArea < 0.2 * N) return;
    ctx.quad = q.map(([x, y]) => [(x + 0.5) / scale, (y + 0.5) / scale]);
    ctx.detectedQuad = ctx.quad;
  }
}

// ── 2. flatten the page to a rectangle ──────────────────────────────────────
export class PerspectiveWarp extends Stage {
  constructor({ maxSide = 2000 } = {}) { super(); this.maxSide = maxSide; }
  run(ctx) {
    if (!ctx.quad) return;
    const [tl, tr, br, bl] = ctx.quad;
    let W = Math.max(dist(tl, tr), dist(bl, br)), H = Math.max(dist(tl, bl), dist(tr, br));
    const s = Math.min(1, this.maxSide / Math.max(W, H));
    W = Math.round(W * s); H = Math.round(H * s);
    const h = homography([[0, 0], [W - 1, 0], [W - 1, H - 1], [0, H - 1]], [tl, tr, br, bl]);
    if (!h) return;
    const out = new GrayImage(W, H), g = ctx.gray;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = h[6] * x + h[7] * y + 1;
      out.data[y * W + x] = g.sample((h[0] * x + h[1] * y + h[2]) / d, (h[3] * x + h[4] * y + h[5]) / d);
    }
    ctx.gray = out;
  }
}

// ── 3. even out shadows and uneven light ─────────────────────────────────────
export class IlluminationFlatten extends Stage {
  run(ctx) {
    const g = ctx.gray;
    const block = Math.max(8, Math.round(Math.min(g.w, g.h) / 50));
    const sw = Math.ceil(g.w / block), sh = Math.ceil(g.h / block);
    // Brightest pixel per block ≈ the paper there (ink strokes are thin and dark).
    let bg = new Float32Array(sw * sh);
    for (let by = 0; by < sh; by++) for (let bx = 0; bx < sw; bx++) {
      let m = 0;
      for (let y = by * block; y < Math.min(g.h, (by + 1) * block); y++)
        for (let x = bx * block; x < Math.min(g.w, (bx + 1) * block); x++) { const v = g.data[y * g.w + x]; if (v > m) m = v; }
      bg[by * sw + bx] = m;
    }
    for (let pass = 0; pass < 3; pass++) {
      const nb = new Float32Array(bg.length);
      for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
        let s = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < sw && yy < sh) { s += bg[yy * sw + xx]; n++; }
        }
        nb[y * sw + x] = s / n;
      }
      bg = nb;
    }
    const small = new GrayImage(sw, sh, bg);
    const out = new GrayImage(g.w, g.h);
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      const b = small.sample((x + 0.5) / block - 0.5, (y + 0.5) / block - 0.5);
      out.data[y * g.w + x] = Math.min(1, g.data[y * g.w + x] / Math.max(0.08, b));
    }
    ctx.gray = out;
  }
}

// ── 4. ink vs paper, decided locally ─────────────────────────────────────────
export class SauvolaBinarize extends Stage {
  constructor({ k = 0.25, R = 0.5 } = {}) { super(); this.k = k; this.R = R; }
  run(ctx) {
    const g = ctx.gray, { sum, sq, W } = g.integrals();
    const r = Math.max(7, Math.round(Math.min(g.w, g.h) / 60));
    const bin = new BinaryImage(g.w, g.h);
    for (let y = 0; y < g.h; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(g.h, y + r + 1);
      for (let x = 0; x < g.w; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(g.w, x + r + 1);
        const n = (x1 - x0) * (y1 - y0);
        const s = sum[y1 * W + x1] - sum[y0 * W + x1] - sum[y1 * W + x0] + sum[y0 * W + x0];
        const q = sq[y1 * W + x1] - sq[y0 * W + x1] - sq[y1 * W + x0] + sq[y0 * W + x0];
        const m = s / n, sd = Math.sqrt(Math.max(0, q / n - m * m));
        const T = m * (1 + this.k * (sd / this.R - 1));
        const v = g.data[y * g.w + x];
        bin.data[y * g.w + x] = v < T && v < 0.82 && v < m - 0.04 ? 1 : 0;
      }
    }
    ctx.bin = bin;
  }
}

// ── 5. exercise-book lines are not writing ──────────────────────────────────
export class RuledLineRemover extends Stage {
  run(ctx) {
    const b = ctx.bin, W = b.w, H = b.h, d = b.data;
    const maxThick = Math.max(3, Math.round(Math.min(W, H) / 350));
    // Vertical run length through every ink pixel.
    const vrun = new Uint16Array(W * H);
    for (let x = 0; x < W; x++) {
      let y = 0;
      while (y < H) {
        if (!d[y * W + x]) { y++; continue; }
        let e = y; while (e < H && d[e * W + x]) e++;
        for (let k = y; k < e; k++) vrun[k * W + x] = Math.min(65535, e - y);
        y = e;
      }
    }
    // Horizontal runs, bridging small breaks: a photographed ruled line comes out as
    // dashes, but it is still one long, thin run once gaps of a few pixels are closed.
    const bridge = Math.max(8, Math.round(W / 160));
    const hrun = new Uint16Array(W * H), hthin = new Uint16Array(W * H);
    for (let y = 0; y < H; y++) {
      let x = 0;
      while (x < W) {
        if (!d[y * W + x]) { x++; continue; }
        let e = x, last = x;
        while (e < W && e - last <= bridge) { if (d[y * W + e]) last = e; e++; }
        const len = last - x + 1;
        for (let k = x; k <= last; k++) hrun[y * W + k] = Math.min(65535, len);
        x = last + 1;
      }
    }
    // Same for columns (the red margin line).
    const vbr = new Uint16Array(W * H);
    for (let x = 0; x < W; x++) {
      let y = 0;
      while (y < H) {
        if (!d[y * W + x]) { y++; continue; }
        let e = y, last = y;
        while (e < H && e - last <= bridge) { if (d[e * W + x]) last = e; e++; }
        for (let k = y; k <= last; k++) vbr[k * W + x] = Math.min(65535, last - y + 1);
        y = last + 1;
      }
    }
    // Width of the unbroken horizontal run through each pixel: a margin line is thin
    // across, a pen stroke may not be.
    for (let y = 0; y < H; y++) {
      let x = 0;
      while (x < W) {
        if (!d[y * W + x]) { x++; continue; }
        let e = x; while (e < W && d[y * W + e]) e++;
        for (let k = x; k < e; k++) hthin[y * W + k] = Math.min(65535, e - x);
        x = e;
      }
    }

    const minH = Math.round(W * 0.15), minV = Math.round(H * 0.25);
    let removed = 0;
    for (let i = 0; i < d.length; i++) {
      if (!d[i]) continue;
      // Long thin horizontal run (ruled line), or long thin vertical run (margin line);
      // a pixel where a letter's stroke crosses the line is thick in the other
      // direction and survives.
      if ((hrun[i] >= minH && vrun[i] <= maxThick) || (vbr[i] >= minV && hthin[i] <= maxThick && vrun[i] >= minV * 0.5)) { d[i] = 0; removed++; }
    }
    ctx.linesRemoved = (ctx.linesRemoved || 0) + removed;
  }
}

// ── 6. straighten tilted writing ─────────────────────────────────────────────
export class Deskew extends Stage {
  constructor({ maxDeg = 7, stepDeg = 0.25, binarizer = new SauvolaBinarize(), lineRemover = new RuledLineRemover() } = {}) {
    super(); Object.assign(this, { maxDeg, stepDeg, binarizer, lineRemover });
  }
  static estimate(bin, maxDeg = 7, stepDeg = 0.25) {
    const pts = [];
    const step = Math.max(1, Math.floor(bin.count() / 40000));
    let k = 0;
    for (let y = 0; y < bin.h; y++) for (let x = 0; x < bin.w; x++) if (bin.data[y * bin.w + x] && (k++ % step === 0)) pts.push(x, y);
    if (pts.length < 200) return 0;
    let best = 0, bestScore = -1;
    const bins = new Float64Array(bin.h * 2 + bin.w);
    for (let deg = -maxDeg; deg <= maxDeg + 1e-9; deg += stepDeg) {
      const t = Math.tan((deg * Math.PI) / 180);
      bins.fill(0);
      for (let i = 0; i < pts.length; i += 2) {
        const yy = Math.round(pts[i + 1] - pts[i] * t) + bin.w;
        if (yy >= 0 && yy < bins.length) bins[yy]++;
      }
      let s = 0;
      for (const c of bins) s += c * c;
      if (s > bestScore) { bestScore = s; best = deg; }
    }
    return best;
  }
  run(ctx) {
    const deg = Deskew.estimate(ctx.bin, this.maxDeg, this.stepDeg);
    ctx.angle = deg;
    if (Math.abs(deg) < 0.3) return;
    ctx.gray = ctx.gray.rotate((-deg * Math.PI) / 180);
    this.binarizer.run(ctx);
    this.lineRemover.run(ctx);
  }
}
