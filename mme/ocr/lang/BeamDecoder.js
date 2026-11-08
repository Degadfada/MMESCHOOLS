// mme/ocr/lang/BeamDecoder.js — read one word.
//
// A word arrives as a row of pieces. Each letter is 1–3 consecutive pieces. The beam
// search tries the ways of grouping pieces into letters, scores each grouping by how
// sure the network is of every letter, how English-like the letter sequence is, and
// — at the end — whether the whole word is one the teacher has written before.
import { readingsOf } from '../Charset.js';

export class BeamDecoder {
  constructor({ net, lexicon, ngram, beam = 14, lmWeight = 0.35, lexBonus = 2.6 }) {
    Object.assign(this, { net, lexicon, ngram, beam, lmWeight, lexBonus });
  }

  /** Punctuation from shape and position alone. */
  static punctuation(box, line) {
    const xh = line.xHeight, base = line.baseline, top = base - xh;
    const out = [];
    const small = box.h < xh * 0.45 && box.w < xh * 0.6;
    if (small) {
      const bottom = box.y + box.h;
      if (bottom > base - xh * 0.3) out.push(bottom > base + xh * 0.25 && box.h > box.w * 1.3 ? [',', 0.85] : ['.', 0.9]);
      else if (bottom < top + xh * 0.3) out.push(["'", 0.7]);
    }
    if (box.h < xh * 0.35 && box.w > box.h * 2 && box.w < xh * 1.5 && box.y > top && box.y + box.h < base) out.push(['-', 0.85]);
    return out;
  }

  candidates(g, line) {
    const punct = g.dotted ? [] : BeamDecoder.punctuation(g.box, line);
    // Capitals and ascenders rise above the small letters; descenders (p, g, y) only
    // drop below the line, which says nothing about case.
    const coreTop = line.baseline - line.xHeight;
    const tall = g.box.y < coreTop - line.xHeight * 0.3;
    const out = punct.map(([ch, p]) => ({ ch, lp: Math.log(p) }));
    const letterPenalty = punct.length ? -3.5 : 0;
    const top = this.net.top(g.pixels, 4);
    for (const t of top) {
      if (t.p < 0.01) continue;
      readingsOf(t.cls, { tall, dotted: g.dotted }).forEach((ch, r) => {
        out.push({ ch, lp: Math.log(t.p) - r * 0.9 + letterPenalty });
      });
    }
    // Shape sanity: a glyph much wider than the line height is rarely one letter.
    const ratio = g.box.w / line.xHeight;
    for (const c of out) if (ratio > 1.5 && !/[mwMW]/.test(c.ch)) c.lp -= (ratio - 1.5) * 2.2;
    return out;
  }

  decode(word, line, glyphAt) {
    const n = word.pieces.length;
    // A hard boundary sits between clusters that do not touch.
    const hard = new Array(n).fill(false);
    for (let i = 1; i < n; i++) {
      const a = word.pieces[i - 1], b = word.pieces[i];
      if (a.cluster !== b.cluster && b.x0 - a.x1 > line.xHeight * 0.12) hard[i] = true;
    }
    const at = Array.from({ length: n + 1 }, () => []);
    at[0].push({ text: '', score: 0, spans: [] });
    for (let pos = 0; pos < n; pos++) {
      const hyps = at[pos].sort((a, b) => b.score - a.score).slice(0, this.beam);
      for (let k = 1; k <= 3 && pos + k <= n; k++) {
        if (k > 1 && hard[pos + k - 1]) break;
        const g = glyphAt(pos, pos + k - 1);
        if (!g) continue;
        const cands = this.candidates(g, line);
        for (const h of hyps) for (const c of cands) {
          const lm = this.ngram ? this.lmWeight * this.ngram.logp(h.text.slice(-2), c.ch) : 0;
          at[pos + k].push({ text: h.text + c.ch, score: h.score + c.lp + lm - (k - 1) * 0.15, spans: [...h.spans, [pos, pos + k - 1]] });
        }
      }
      if (at[pos + 1].length > this.beam * 8) at[pos + 1] = at[pos + 1].sort((a, b) => b.score - a.score).slice(0, this.beam * 4);
    }
    // The network can't tell c from C, so try each reading in lower, Capitalised and
    // UPPER case too and let the word list and the case rules decide.
    const finals = [];
    for (const h of at[n]) {
      finals.push({ ...h, score: h.score + this.wordScore(h.text) });
      for (const v of BeamDecoder.caseVariants(h.text)) finals.push({ ...h, text: v, score: h.score - 0.35 + this.wordScore(v) });
    }
    finals.sort((a, b) => b.score - a.score);
    const seen = new Set(), uniq = [];
    for (const f of finals) { if (!seen.has(f.text)) { seen.add(f.text); uniq.push(f); } if (uniq.length >= 6) break; }
    if (!uniq.length) return { text: '', conf: 0, alts: [], spans: [] };
    const m = uniq[0].score;
    const z = uniq.reduce((a, u) => a + Math.exp(u.score - m), 0);
    return {
      text: uniq[0].text, spans: uniq[0].spans, score: uniq[0].score,
      conf: Math.round((1 / z) * 100) / 100,
      alts: uniq.slice(1, 4).map(u => u.text)
    };
  }

  static caseVariants(text) {
    if (!/[A-Za-z]/.test(text)) return [];
    const lower = text.toLowerCase(), upper = text.toUpperCase();
    const cap = lower.replace(/[a-z]/, c => c.toUpperCase());
    return [...new Set([lower, cap, upper])].filter(v => v !== text);
  }

  wordScore(text) {
    let s = 0;
    if (this.ngram) s += this.lmWeight * this.ngram.logp(text.slice(-2), '$');
    const core = text.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
    if (this.lexicon && core && /[a-z]/i.test(core)) {
      const lp = this.lexicon.logp(core);
      // Short words are easy to "find" by accident; long known words are real evidence.
      if (lp !== null) s += this.lexBonus * Math.min(1, 0.35 + core.length / 6) + 0.08 * lp;
    }
    // "hEllo" is unlikely; "Hello", "hello", "HELLO" are fine.
    s -= 1.6 * (core.match(/[a-z][A-Z]|[A-Z]{2}[a-z]/g) || []).length;
    if (/[A-Za-z]\d|\d[A-Za-z]/.test(core) && !/^\d+(st|nd|rd|th)$/i.test(core)) s -= 1.2;
    return s;
  }
}
