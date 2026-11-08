// mme/ocr/layout/LineSegmenter.js — group ink components into lines of writing.
// Works from the components themselves rather than a page-wide projection, so
// handwriting that wanders a little up and down still lands on one line.

export class TextLine {
  constructor() { this.comps = []; this.top = Infinity; this.bottom = -1; }
  get core() {
    // The band most letters occupy, robust to ascenders/descenders.
    const big = this.comps.filter(c => !c.small);
    const src = big.length ? big : this.comps;
    const tops = src.map(c => c.y0).sort((a, b) => a - b), bots = src.map(c => c.y1).sort((a, b) => a - b);
    return { top: tops[Math.floor(tops.length / 2)], bottom: bots[Math.floor(bots.length / 2)] };
  }
  add(c) { this.comps.push(c); this.top = Math.min(this.top, c.y0); this.bottom = Math.max(this.bottom, c.y1); }
  get x0() { return Math.min(...this.comps.map(c => c.x0)); }
  get x1() { return Math.max(...this.comps.map(c => c.x1)); }
}

export class LineSegmenter {
  segment(components) {
    const medH = components.medianHeight;
    const comps = components.list.slice();
    for (const c of comps) c.small = c.h < medH * 0.45 && c.w < medH * 0.6;
    const big = comps.filter(c => !c.small).sort((a, b) => a.cx - b.cx);
    const lines = [];
    // Left to right, so each line's band follows the writing as it drifts.
    for (const c of big) {
      let best = null, bestOv = 0;
      for (const l of lines) {
        const recent = l.comps.slice(-4);
        const top = Math.min(...recent.map(r => r.y0)), bot = Math.max(...recent.map(r => r.y1));
        const ov = Math.min(bot, c.y1) - Math.max(top, c.y0);
        const frac = ov / Math.min(c.h, bot - top + 1);
        const near = c.x0 - Math.max(...recent.map(r => r.x1)) < medH * 6;
        if (frac > 0.45 && near && frac > bestOv) { bestOv = frac; best = l; }
      }
      if (!best) { best = new TextLine(); lines.push(best); }
      best.add(c);
    }
    // Dots, commas and accents go to the nearest line (an i-dot sits just above its line).
    for (const c of comps.filter(x => x.small)) {
      let best = null, bd = Infinity;
      for (const l of lines) {
        // Marks well before the writing starts are page furniture (margin bits, holes).
        if (c.cx < l.x0 - medH * 0.5 || c.cx > l.x1 + medH * 1.5) continue;
        const core = l.core;
        const d = c.cy < core.top ? (core.top - c.cy) * 0.7 : c.cy > core.bottom ? c.cy - core.bottom : 0;
        if (d < bd) { bd = d; best = l; }
      }
      if (best && bd < medH * 1.3) best.add(c);
    }
    // Two pieces of one line that were started separately: merge them.
    lines.sort((a, b) => a.core.top - b.core.top);
    const merged = [];
    for (const l of lines) {
      const prev = merged.find(m => {
        const a = m.core, b = l.core;
        const ov = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        const xsep = l.x0 > m.x1 || l.x1 < m.x0;
        return ov > 0.5 * Math.min(a.bottom - a.top, b.bottom - b.top) && xsep;
      });
      if (prev) for (const c of l.comps) prev.add(c); else merged.push(l);
    }
    const out = merged.filter(l => l.comps.some(c => !c.small));
    for (const l of out) {
      const core = l.core;
      l.xHeight = Math.max(4, core.bottom - core.top);
      l.baseline = core.bottom;
      l.comps.sort((a, b) => a.x0 - b.x0);
    }
    return out.sort((a, b) => a.core.top - b.core.top || a.x0 - b.x0);
  }
}
