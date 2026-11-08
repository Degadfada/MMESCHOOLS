// mme/ocr/layout/WordSegmenter.js — split a line into words, and each word into
// "pieces": the smallest units a character can be built from.
//
// Components that overlap horizontally (the dot of an i, a t's cross-bar written
// separately) become one cluster. In joined-up writing one cluster can hold several
// letters, so clusters wider than a letter are cut at thin vertical points
// (CutPointFinder); the decoder later decides which pieces join into which letters.

export class Cluster {
  constructor(c) { this.comps = [c]; this.x0 = c.x0; this.x1 = c.x1; this.y0 = c.y0; this.y1 = c.y1; }
  add(c) { this.comps.push(c); this.x0 = Math.min(this.x0, c.x0); this.x1 = Math.max(this.x1, c.x1); this.y0 = Math.min(this.y0, c.y0); this.y1 = Math.max(this.y1, c.y1); }
  get w() { return this.x1 - this.x0 + 1; }
  get h() { return this.y1 - this.y0 + 1; }
}

export class WordSegmenter {
  constructor(cutter) { this.cutter = cutter; }

  clusters(line) {
    const out = [];
    for (const c of line.comps) {
      const last = out[out.length - 1];
      if (last) {
        const ov = Math.min(last.x1, c.x1) - Math.max(last.x0, c.x0);
        if (ov > 0.45 * Math.min(c.w, last.w) || (c.small && ov > -1)) { last.add(c); continue; }
      }
      out.push(new Cluster(c));
    }
    return out;
  }

  /** Gap above which two clusters belong to different words. */
  static wordGap(gaps, xh) {
    if (!gaps.length) return Infinity;
    const s = gaps.slice().sort((a, b) => a - b);
    // Two-means on the gaps: letter spacing vs word spacing.
    let lo = s[0], hi = s[s.length - 1];
    for (let it = 0; it < 12; it++) {
      const t = (lo + hi) / 2;
      const A = s.filter(g => g <= t), B = s.filter(g => g > t);
      if (!A.length || !B.length) break;
      lo = A.reduce((a, b) => a + b, 0) / A.length; hi = B.reduce((a, b) => a + b, 0) / B.length;
    }
    const floor = xh * 0.42;
    if (hi > lo * 1.8 && hi > floor) return Math.max((lo + hi) / 2, floor);      // two kinds of gap
    // One kind of gap: in joined-up writing every gap is a word gap; in print, none is.
    const median = s[Math.floor(s.length / 2)];
    return median > floor * 1.3 ? floor : Infinity;
  }

  segment(line) {
    const cl = this.clusters(line);
    const gaps = [];
    for (let i = 1; i < cl.length; i++) gaps.push(cl[i].x0 - Math.max(...cl.slice(0, i).map(c => c.x1)));
    const t = WordSegmenter.wordGap(gaps, line.xHeight);
    const words = [];
    let cur = [];
    cl.forEach((c, i) => {
      if (i > 0 && gaps[i - 1] > t) { words.push(cur); cur = []; }
      cur.push(c);
    });
    if (cur.length) words.push(cur);
    return words.map(clusters => {
      const pieces = [];
      clusters.forEach((c, ci) => {
        const cuts = this.cutter.cuts(c, line);
        let start = c.x0;
        for (const x of [...cuts, c.x1 + 1]) {
          pieces.push({ x0: start, x1: x - 1, cluster: c, joinedLeft: start !== c.x0, clusterIndex: ci });
          start = x;
        }
      });
      return { clusters, pieces, x0: clusters[0].x0, x1: clusters[clusters.length - 1].x1,
        y0: Math.min(...clusters.map(c => c.y0)), y1: Math.max(...clusters.map(c => c.y1)) };
    });
  }
}
