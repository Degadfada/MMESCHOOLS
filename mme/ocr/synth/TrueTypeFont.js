// mme/ocr/synth/TrueTypeFont.js — read a .ttf and draw its letters, from scratch.
// Used to make seed training data for the handwriting reader out of the handwriting-
// style fonts already on the computer (Ink Free, Segoe Print, Comic Sans …), so the
// first model needs no download.

export class TrueTypeFont {
  constructor(buffer) {
    const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    this.dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const dv = this.dv;
    const n = dv.getUint16(4);
    this.tables = {};
    for (let i = 0; i < n; i++) {
      const p = 12 + i * 16;
      const tag = String.fromCharCode(dv.getUint8(p), dv.getUint8(p + 1), dv.getUint8(p + 2), dv.getUint8(p + 3));
      this.tables[tag] = { offset: dv.getUint32(p + 8), length: dv.getUint32(p + 12) };
    }
    if (!this.tables.glyf) throw new Error('not a TrueType-outline font');
    this.unitsPerEm = dv.getUint16(this.tables.head.offset + 18);
    this.locFormat = dv.getInt16(this.tables.head.offset + 50);
    this.numGlyphs = dv.getUint16(this.tables.maxp.offset + 4);
    this.ascent = dv.getInt16(this.tables.hhea.offset + 4);
    this.descent = dv.getInt16(this.tables.hhea.offset + 6);
    this.numHMetrics = dv.getUint16(this.tables.hhea.offset + 34);
    this._cmap();
  }

  _cmap() {
    const dv = this.dv, base = this.tables.cmap.offset, n = dv.getUint16(base + 2);
    let best = null;
    for (let i = 0; i < n; i++) {
      const pid = dv.getUint16(base + 4 + i * 8), eid = dv.getUint16(base + 6 + i * 8), off = dv.getUint32(base + 8 + i * 8);
      const fmt = dv.getUint16(base + off);
      const score = (pid === 3 && eid === 10 && fmt === 12) ? 3 : (pid === 3 && eid === 1 && fmt === 4) ? 2 : (pid === 0 && (fmt === 4 || fmt === 12)) ? 1 : 0;
      if (score && (!best || score > best.score)) best = { score, at: base + off, fmt };
    }
    if (!best) throw new Error('no usable cmap');
    this.cmapAt = best.at; this.cmapFmt = best.fmt;
  }

  glyphIndex(code) {
    const dv = this.dv, p = this.cmapAt;
    if (this.cmapFmt === 12) {
      const groups = dv.getUint32(p + 12);
      for (let i = 0; i < groups; i++) {
        const g = p + 16 + i * 12, s = dv.getUint32(g), e = dv.getUint32(g + 4);
        if (code >= s && code <= e) return dv.getUint32(g + 8) + code - s;
      }
      return 0;
    }
    const segX2 = dv.getUint16(p + 6), seg = segX2 / 2;
    const ends = p + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
    for (let i = 0; i < seg; i++) {
      const end = dv.getUint16(ends + i * 2);
      if (code > end) continue;
      const start = dv.getUint16(starts + i * 2);
      if (code < start) return 0;
      const delta = dv.getInt16(deltas + i * 2), ro = dv.getUint16(ranges + i * 2);
      if (!ro) return (code + delta) & 0xffff;
      const g = dv.getUint16(ranges + i * 2 + ro + (code - start) * 2);
      return g ? (g + delta) & 0xffff : 0;
    }
    return 0;
  }

  advance(gi) {
    const i = Math.min(gi, this.numHMetrics - 1);
    return this.dv.getUint16(this.tables.hmtx.offset + i * 4);
  }

  _loca(gi) {
    const o = this.tables.loca.offset;
    return this.locFormat === 0 ? this.dv.getUint16(o + gi * 2) * 2 : this.dv.getUint32(o + gi * 4);
  }

  /** Contours: arrays of {x, y, on}. */
  contours(gi, depth = 0) {
    if (gi >= this.numGlyphs || depth > 6) return [];
    const start = this._loca(gi), end = this._loca(gi + 1);
    if (end <= start) return [];
    const dv = this.dv;
    let p = this.tables.glyf.offset + start;
    const nc = dv.getInt16(p); p += 10;
    if (nc >= 0) {
      const ends = [];
      for (let i = 0; i < nc; i++) { ends.push(dv.getUint16(p)); p += 2; }
      p += 2 + dv.getUint16(p);
      const n = ends.length ? ends[ends.length - 1] + 1 : 0;
      const flags = [];
      while (flags.length < n) {
        const f = dv.getUint8(p++);
        flags.push(f);
        if (f & 8) { let r = dv.getUint8(p++); while (r--) flags.push(f); }
      }
      const xs = [], ys = [];
      let v = 0;
      for (const f of flags) {
        if (f & 2) { const d = dv.getUint8(p++); v += f & 16 ? d : -d; }
        else if (!(f & 16)) { v += dv.getInt16(p); p += 2; }
        xs.push(v);
      }
      v = 0;
      for (const f of flags) {
        if (f & 4) { const d = dv.getUint8(p++); v += f & 32 ? d : -d; }
        else if (!(f & 32)) { v += dv.getInt16(p); p += 2; }
        ys.push(v);
      }
      const out = [];
      let s = 0;
      for (const e of ends) { out.push(xs.slice(s, e + 1).map((x, k) => ({ x, y: ys[s + k], on: !!(flags[s + k] & 1) }))); s = e + 1; }
      return out;
    }
    // Composite glyph.
    const out = [];
    let more = true;
    while (more) {
      const flags = dv.getUint16(p), idx = dv.getUint16(p + 2); p += 4;
      let dx, dy;
      if (flags & 1) { dx = dv.getInt16(p); dy = dv.getInt16(p + 2); p += 4; } else { dx = dv.getInt8(p); dy = dv.getInt8(p + 1); p += 2; }
      let a = 1, b = 0, c = 0, d = 1;
      const f2 = (o) => dv.getInt16(o) / 16384;
      if (flags & 8) { a = d = f2(p); p += 2; }
      else if (flags & 0x40) { a = f2(p); d = f2(p + 2); p += 4; }
      else if (flags & 0x80) { a = f2(p); b = f2(p + 2); c = f2(p + 4); d = f2(p + 6); p += 8; }
      for (const ct of this.contours(idx, depth + 1)) out.push(ct.map(pt => ({ x: a * pt.x + c * pt.y + (flags & 2 ? dx : 0), y: b * pt.x + d * pt.y + (flags & 2 ? dy : 0), on: pt.on })));
      more = !!(flags & 0x20);
    }
    return out;
  }

  /** Contours → closed polygons (quadratic curves flattened). */
  polygons(gi, steps = 6) {
    const polys = [];
    for (const ct of this.contours(gi)) {
      if (ct.length < 2) continue;
      // Start on an on-curve point (or the implied midpoint of two off-curve points).
      let first = ct.findIndex(p => p.on);
      const pts = first >= 0 ? [...ct.slice(first), ...ct.slice(0, first)] : [{ x: (ct[0].x + ct[1].x) / 2, y: (ct[0].y + ct[1].y) / 2, on: true }, ...ct];
      const poly = [[pts[0].x, pts[0].y]];
      let cur = pts[0];
      for (let i = 1; i <= pts.length; i++) {
        const p = pts[i % pts.length];
        if (p.on) { poly.push([p.x, p.y]); cur = p; continue; }
        const nx = pts[(i + 1) % pts.length];
        const end = nx.on ? nx : { x: (p.x + nx.x) / 2, y: (p.y + nx.y) / 2, on: true };
        for (let s = 1; s <= steps; s++) {
          const t = s / steps, u = 1 - t;
          poly.push([u * u * cur.x + 2 * u * t * p.x + t * t * end.x, u * u * cur.y + 2 * u * t * p.y + t * t * end.y]);
        }
        cur = end;
        if (nx.on) i++;
      }
      polys.push(poly);
    }
    return polys;
  }
}

/**
 * Fill polygons (non-zero winding) into a bitmap.
 * @param polys  [[ [x,y], … ], …] already in pixel space (y down)
 */
export function rasterize(polys, W, H) {
  const out = new Uint8Array(W * H);
  const edges = [];
  for (const poly of polys) for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length];
    if (y0 === y1) continue;
    edges.push(y0 < y1 ? { x0, y0, x1, y1, d: 1 } : { x0: x1, y0: y1, x1: x0, y1: y0, d: -1 });
  }
  for (let y = 0; y < H; y++) {
    const sy = y + 0.5;
    const xs = [];
    for (const e of edges) if (sy >= e.y0 && sy < e.y1) xs.push({ x: e.x0 + ((sy - e.y0) / (e.y1 - e.y0)) * (e.x1 - e.x0), d: e.d });
    xs.sort((a, b) => a.x - b.x);
    let wind = 0;
    for (let i = 0; i < xs.length - 1; i++) {
      wind += xs[i].d;
      if (wind !== 0) {
        const a = Math.max(0, Math.ceil(xs[i].x - 0.5)), b = Math.min(W - 1, Math.floor(xs[i + 1].x - 0.5));
        for (let x = a; x <= b; x++) out[y * W + x] = 1;
      }
    }
  }
  return out;
}
