// mme/ocr/synth/GlyphSynth.js — render text with a font, as a pen might: slightly
// rotated, slanted, squashed, thicker or thinner each time. Produces training
// glyphs, "not a letter" samples, and whole synthetic pages for testing the reader.
import { rasterize } from './TrueTypeFont.js';
import { Glyph } from '../layout/Glyph.js';
import { classOf, REJECT } from '../Charset.js';

export const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export class GlyphSynth {
  constructor(fonts, rng) { this.fonts = fonts; this.rng = rng; }

  /** Lay out `text` with `font` at em size `px`, transformed by a random "hand". */
  renderText(font, text, px, hand = this.hand()) {
    const s = px / font.unitsPerEm;
    const polys = [];
    let pen = 0;
    for (const ch of text) {
      const gi = font.glyphIndex(ch.codePointAt(0));
      for (const poly of font.polygons(gi)) polys.push(poly.map(([x, y]) => [x * s + pen, -y * s]));
      pen += font.advance(gi) * s * hand.spacing;
    }
    // Hand transform: slant, rotation, width.
    const c = Math.cos(hand.rot), sn = Math.sin(hand.rot);
    const tp = polys.map(poly => poly.map(([x, y]) => {
      const xx = (x + hand.slant * -y) * hand.width;
      return [c * xx - sn * y, sn * xx + c * y];
    }));
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of tp) for (const [x, y] of p) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    if (!isFinite(minX)) return null;
    const pad = 3;
    const W = Math.ceil(maxX - minX) + pad * 2, H = Math.ceil(maxY - minY) + pad * 2;
    let bmp = rasterize(tp.map(p => p.map(([x, y]) => [x - minX + pad, y - minY + pad])), W, H);
    for (let i = 0; i < hand.thick; i++) bmp = GlyphSynth.dilate(bmp, W, H);
    if (hand.thick < 0) bmp = GlyphSynth.erode(bmp, W, H);
    return { bmp, W, H, baselineY: -minY + pad };
  }

  hand() {
    const r = this.rng;
    return { rot: (r() - 0.5) * 0.16, slant: (r() - 0.4) * 0.45, width: 0.82 + r() * 0.36, spacing: 0.92 + r() * 0.16, thick: r() < 0.3 ? 1 : r() < 0.12 ? -1 : 0 };
  }

  static dilate(b, W, H) {
    const o = b.slice();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (b[y * W + x]) { if (x + 1 < W) o[y * W + x + 1] = 1; if (y + 1 < H) o[(y + 1) * W + x] = 1; }
    return o;
  }
  static erode(b, W, H) {
    const o = b.slice();
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (b[y * W + x] && !(b[y * W + x - 1] && b[(y - 1) * W + x])) o[y * W + x] = 0;
    return o;
  }

  static toGlyph({ bmp, W, H }, x0 = 0, x1 = W - 1) {
    return Glyph.normalize((x, y) => bmp[y * W + x], x0, 0, x1, H - 1);
  }

  /** One labelled sample of `ch`. */
  sample(ch) {
    const font = this.fonts[Math.floor(this.rng() * this.fonts.length)];
    const r = this.renderText(font.font, ch, 40 + this.rng() * 50);
    if (!r) return null;
    return { px: GlyphSynth.toGlyph(r), y: classOf(ch) };
  }

  /** A "not one letter" sample: two letters together, or part of one letter. */
  reject() {
    const font = this.fonts[Math.floor(this.rng() * this.fonts.length)];
    const pick = () => ALPHABET[Math.floor(this.rng() * ALPHABET.length)];
    const t = this.rng();
    if (t < 0.5) {
      const r = this.renderText(font.font, pick() + pick(), 50 + this.rng() * 40);
      return r && { px: GlyphSynth.toGlyph(r), y: REJECT };
    }
    const r = this.renderText(font.font, 'mwMWHNUAhnu'[Math.floor(this.rng() * 11)] + (t < 0.75 ? '' : pick()), 60 + this.rng() * 40);
    if (!r) return null;
    const cut = Math.floor(r.W * (0.3 + this.rng() * 0.25));
    return this.rng() < 0.5 ? { px: GlyphSynth.toGlyph(r, 0, cut), y: REJECT } : { px: GlyphSynth.toGlyph(r, cut, r.W - 1), y: REJECT };
  }

  dataset(perChar, rejectFrac = 0.12, onProgress) {
    const out = [];
    const total = ALPHABET.length * perChar;
    for (const ch of ALPHABET) {
      for (let i = 0; i < perChar; i++) { const s = this.sample(ch); if (s && s.y >= 0) out.push(s); }
      if (onProgress) onProgress(out.length, total);
    }
    const nr = Math.round(out.length * rejectFrac);
    for (let i = 0; i < nr; i++) { const s = this.reject(); if (s) out.push(s); }
    return out;
  }
}
