// mme/text/Text.js — small, shared language helpers (node + browser).
// Ported from the IDA Tech cert app (lib/comprehend.js, lib/mcq.js) and widened
// from AWS study notes to general school notes.

export const STOP = new Set(('a an and are as at be been being but by can could do does did for from had has have how in into is it its of on only or other our over so than that the their then there these they this those to up use used uses using was were what when where which while who why will with you your not no if any all each both very more most much many some such own same too just also them he she his her we me my like etc called known may might must should would shall one two three also often usually always never about after before during between through under above below out off again further once here why').split(/\s+/));

export class Text {
  static norm(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/[‘’ʼ`']/g, '').replace(/[^a-z0-9%]+/g, ' ').trim();
  }

  static words(s) { return Text.norm(s).split(' ').filter(Boolean); }

  static content(s) { return Text.words(s).filter(w => w.length > 2 && !STOP.has(w)); }

  /** Crude stemmer: a prefix that survives different word endings. */
  static stem(w) {
    let s = String(w).toLowerCase().replace(/[^a-z0-9%]/g, '');
    if (s.length <= 4) return s;
    s = s.replace(/ies$/, 'y').replace(/(?:ations|ation)$/, 'at')
         .replace(/(?:ing|ers|ed|es|ion|ions|ally|ly|ness|ment|s)$/, '');
    return s.length >= 4 ? s : String(w).toLowerCase().slice(0, 5);
  }

  /** Overlap of content words, 0..1, relative to the shorter statement. */
  static similar(a, b) {
    const A = new Set(Text.content(a).map(Text.stem)), B = new Set(Text.content(b).map(Text.stem));
    if (!A.size || !B.size) return 0;
    let n = 0;
    for (const w of A) if (B.has(w)) n++;
    return n / Math.min(A.size, B.size);
  }

  static sentences(text) {
    return String(text).replace(/\s+/g, ' ')
      .split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/)
      .map(s => s.trim()).filter(Boolean);
  }

  static capitalise(s) { s = String(s).trim(); return s.charAt(0).toUpperCase() + s.slice(1); }
  static lowerFirst(s) {
    s = String(s).trim();
    // Keep acronyms and proper nouns ("DNA", "Nigeria") as written.
    if (/^[A-Z][a-z]/.test(s) && !/^[A-Z][a-z]+\s+[A-Z]/.test(s)) return s.charAt(0).toLowerCase() + s.slice(1);
    return s;
  }
  static trimEnd(s) { return String(s).trim().replace(/[\s,;:.]+$/, ''); }

  /** Shorten to at most `max` chars on a word boundary. */
  static clip(s, max = 160) {
    s = Text.trimEnd(s);
    if (s.length <= max) return s;
    const cut = s.slice(0, max);
    return cut.slice(0, Math.max(cut.lastIndexOf(' '), max * 0.6)).replace(/[\s,;:]+$/, '') + '…';
  }

  static slug(s) { return Text.norm(s).replace(/\s+/g, '-').slice(0, 48); }

  static hash(s) {
    let h = 2166136261;
    for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }
}

/** Deterministic PRNG (mulberry32) so a given seed always spins the same paper. */
export class Rng {
  constructor(seed = Date.now()) { this.s = (typeof seed === 'number' ? seed : parseInt(Text.hash(seed), 36)) >>> 0; }
  next() {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n) { return Math.floor(this.next() * n); }
  pick(a) { return a[this.int(a.length)]; }
  shuffle(a) {
    const b = a.slice();
    for (let i = b.length - 1; i > 0; i--) { const j = this.int(i + 1); [b[i], b[j]] = [b[j], b[i]]; }
    return b;
  }
}
