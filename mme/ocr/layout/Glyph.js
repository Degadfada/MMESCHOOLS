// mme/ocr/layout/Glyph.js — turn a piece of ink into the 28×28 picture the network
// reads. Every source (a real photo, a font, a teacher's correction) goes through
// exactly this function, so the network always sees the same kind of picture.

export const SIZE = 28;
export const FIT = 22;

export class Glyph {
  /**
   * Normalise an ink mask. `get(x, y)` → 0..1 ink over the box [x0,x1]×[y0,y1].
   * Returns Float32Array(784), 1 = ink.
   */
  static normalize(get, x0, y0, x1, y1) {
    // Tight box around actual ink.
    let tx0 = Infinity, ty0 = Infinity, tx1 = -1, ty1 = -1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (get(x, y) > 0.3) {
      if (x < tx0) tx0 = x; if (x > tx1) tx1 = x; if (y < ty0) ty0 = y; if (y > ty1) ty1 = y;
    }
    const out = new Float32Array(SIZE * SIZE);
    if (tx1 < 0) return out;
    const w = tx1 - tx0 + 1, h = ty1 - ty0 + 1;
    const s = FIT / Math.max(w, h);
    const ow = Math.max(1, w * s), oh = Math.max(1, h * s);
    const ox = (SIZE - ow) / 2, oy = (SIZE - oh) / 2;
    // Area sampling: each output pixel averages the source ink it covers (4×4 taps).
    for (let Y = 0; Y < SIZE; Y++) for (let X = 0; X < SIZE; X++) {
      let acc = 0;
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
        const u = (X + (sx + 0.5) / 4 - ox) / s + tx0, v = (Y + (sy + 0.5) / 4 - oy) / s + ty0;
        if (u < tx0 - 0.5 || v < ty0 - 0.5 || u > tx1 + 0.5 || v > ty1 + 0.5) continue;
        acc += get(Math.min(tx1, Math.max(tx0, Math.round(u - 0.5 + 0.5) | 0)), Math.min(ty1, Math.max(ty0, Math.round(v - 0.5 + 0.5) | 0)));
      }
      out[Y * SIZE + X] = acc / 16;
    }
    return out;
  }

  /** Pieces [a..b] of a word, cut from the label map, as a normalised glyph + geometry. */
  static fromPieces(pieces, a, b, labels, W) {
    const x0 = pieces[a].x0, x1 = pieces[b].x1;
    const ids = new Set();
    for (let k = a; k <= b; k++) for (const c of pieces[k].cluster.comps) ids.add(c.id);
    let y0 = Infinity, y1 = -1;
    for (let k = a; k <= b; k++) { y0 = Math.min(y0, pieces[k].cluster.y0); y1 = Math.max(y1, pieces[k].cluster.y1); }
    const get = (x, y) => (ids.has(labels[y * W + x]) ? 1 : 0);
    // Tight vertical extent of the ink actually inside [x0, x1].
    let ty0 = Infinity, ty1 = -1, tx0 = Infinity, tx1 = -1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (get(x, y)) {
      if (y < ty0) ty0 = y; if (y > ty1) ty1 = y; if (x < tx0) tx0 = x; if (x > tx1) tx1 = x;
    }
    if (ty1 < 0) return null;
    // A blank band in the upper part of the glyph = a separate dot (i, j) above the stem.
    let dotted = false;
    const hh = ty1 - ty0 + 1;
    if (hh >= 6) {
      let seenInk = false, gap = 0;
      for (let y = ty0; y <= ty0 + Math.floor(hh * 0.6); y++) {
        let ink = false;
        for (let x = tx0; x <= tx1 && !ink; x++) if (get(x, y)) ink = true;
        if (ink && seenInk && gap >= 1) { dotted = true; break; }
        if (ink) { seenInk = true; gap = 0; } else if (seenInk) gap++;
      }
    }
    return { pixels: Glyph.normalize(get, tx0, ty0, tx1, ty1), box: { x: tx0, y: ty0, w: tx1 - tx0 + 1, h: hh }, dotted };
  }

  static toBytes(px) { const b = new Uint8Array(px.length); for (let i = 0; i < px.length; i++) b[i] = Math.round(px[i] * 255); return b; }
  static fromBytes(b) { const f = new Float32Array(b.length); for (let i = 0; i < b.length; i++) f[i] = b[i] / 255; return f; }
}
