// mme/ocr/learn/CorrectionHarvester.js — turn the teacher's corrections into training
// samples for HER model. Her fixed text is aligned to what the OCR read, word by word;
// wherever a word has exactly as many letters as the OCR found glyphs, each glyph
// gets her letter as its label. Words she left alone are kept too (they confirm the
// reading), but fewer of them, so corrections carry the weight.
import { classOf, CHARSET, REJECT } from '../Charset.js';
import { Glyph } from '../layout/Glyph.js';

export const REJECT_LABEL = CHARSET[REJECT];

export class CorrectionHarvester {
  static tokens(text) { return String(text).split(/\s+/).filter(Boolean); }

  /** Edit-distance alignment of two token arrays → pairs [i, j] (−1 = gap). */
  static align(a, b) {
    const n = a.length, m = b.length;
    const D = Array.from({ length: n + 1 }, (_, i) => new Int32Array(m + 1).fill(0).map((_, j) => (i === 0 ? j : j === 0 ? i : 0)));
    const same = (x, y) => x.toLowerCase() === y.toLowerCase();
    const near = (x, y) => Math.abs(x.length - y.length) <= 2;
    for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
      D[i][j] = Math.min(D[i - 1][j] + 1, D[i][j - 1] + 1, D[i - 1][j - 1] + (same(a[i - 1], b[j - 1]) ? 0 : near(a[i - 1], b[j - 1]) ? 1 : 2));
    }
    const pairs = [];
    let i = n, j = m;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && D[i][j] === D[i - 1][j - 1] + (same(a[i - 1], b[j - 1]) ? 0 : near(a[i - 1], b[j - 1]) ? 1 : 2)) { pairs.push([i - 1, j - 1]); i--; j--; }
      else if (i > 0 && D[i][j] === D[i - 1][j] + 1) { pairs.push([i - 1, -1]); i--; }
      else { pairs.push([-1, j - 1]); j--; }
    }
    return pairs.reverse();
  }

  /**
   * @param result  OcrEngine.recognize() output
   * @param fixed   the text the teacher accepted
   * @returns [{label, glyph: Uint8Array(784), corrected: boolean}]
   */
  harvest(result, fixed, { keepConfirmed = 0.35, rng = Math.random } = {}) {
    const ocrWords = result.lines.flatMap(l => l.words);
    const pairs = CorrectionHarvester.align(ocrWords.map(w => w.text), CorrectionHarvester.tokens(fixed));
    const fixedTokens = CorrectionHarvester.tokens(fixed);
    const out = [];
    for (const [i, j] of pairs) {
      if (i < 0 || j < 0) continue;
      const w = ocrWords[i];
      const target = fixedTokens[j];
      const corrected = w.text !== target;
      if (!corrected && rng() > keepConfirmed) continue;
      if (target.length !== w.glyphs.length) continue;
      [...target].forEach((ch, k) => {
        if (classOf(ch) < 0) return;                  // punctuation is read by shape, not learned
        out.push({ label: ch, glyph: Glyph.toBytes(w.glyphs[k].px), corrected: corrected && w.text[k] !== ch });
      });
      // The letter boundaries are now known to be right, so the wrong cuts are true rejects.
      for (const px of w.negatives || []) out.push({ label: REJECT_LABEL, glyph: Glyph.toBytes(px), corrected: false });
    }
    return out;
  }
}
