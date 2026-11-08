// mme/ocr/layout/CutPointFinder.js — where might one letter end and the next begin
// inside a joined-up cluster? At columns where the ink is thin (a single connecting
// stroke) and lower than its neighbours. We over-cut on purpose: joining pieces back
// together is the decoder's job, splitting a letter we failed to cut is impossible.

export class CutPointFinder {
  constructor(labels, width) { this.labels = labels; this.W = width; }

  /** Ink count per column of a cluster, counting only that cluster's components. */
  profile(cluster) {
    const ids = new Set(cluster.comps.map(c => c.id));
    const prof = new Float32Array(cluster.w);
    for (let y = cluster.y0; y <= cluster.y1; y++) {
      const row = y * this.W;
      for (let x = cluster.x0; x <= cluster.x1; x++) if (ids.has(this.labels[row + x])) prof[x - cluster.x0]++;
    }
    return prof;
  }

  cuts(cluster, line) {
    const xh = line.xHeight;
    if (cluster.w < xh * 0.95) return [];
    const p = this.profile(cluster);
    const sm = p.map((_, i) => (p[Math.max(0, i - 1)] + p[i] + p[Math.min(p.length - 1, i + 1)]) / 3);
    const minGap = Math.max(2, Math.round(xh * 0.28));
    const edge = Math.max(2, Math.round(xh * 0.2));
    const thin = Math.max(1.5, xh * 0.22);
    const cands = [];
    for (let i = edge; i < sm.length - edge; i++) {
      const v = sm[i];
      if (v > thin) continue;
      const L = Math.max(...sm.slice(Math.max(0, i - minGap), i)), R = Math.max(...sm.slice(i + 1, i + 1 + minGap));
      if (v <= L && v <= R && (L - v > 0.5 || R - v > 0.5 || v === 0)) cands.push({ i, v });
    }
    // Keep the thinnest cut in each neighbourhood.
    cands.sort((a, b) => a.v - b.v);
    const chosen = [];
    for (const c of cands) if (chosen.every(o => Math.abs(o - c.i) >= minGap)) chosen.push(c.i);
    // Very wide clusters with no thin point still get evenly spaced cuts.
    if (!chosen.length && cluster.w > xh * 2.2) {
      const n = Math.round(cluster.w / (xh * 0.8));
      for (let k = 1; k < n; k++) chosen.push(Math.round((k * cluster.w) / n));
    }
    return chosen.sort((a, b) => a - b).map(i => cluster.x0 + i);
  }
}
