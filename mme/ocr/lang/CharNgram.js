// mme/ocr/lang/CharNgram.js — which letters tend to follow which (trigrams, smoothed).
// Lets the reader prefer "the" over "tbe" even for a word it has never seen.

export class CharNgram {
  constructor(k = 0.3) { this.k = k; this.tri = new Map(); this.bi = new Map(); this.V = 30; }

  train(words) {
    for (const [w, n] of words) {
      const s = '^^' + w.toLowerCase().replace(/[^a-z']/g, '') + '$';
      const c = Math.min(50, Math.max(1, Math.round(Math.log2(1 + n))));
      for (let i = 2; i < s.length; i++) {
        const h = s.slice(i - 2, i);
        this.tri.set(h + s[i], (this.tri.get(h + s[i]) || 0) + c);
        this.bi.set(h, (this.bi.get(h) || 0) + c);
      }
    }
    return this;
  }

  /** log P(ch | two previous characters). History uses '^' for start. */
  logp(prev2, ch) {
    const h = prev2.toLowerCase().replace(/[^a-z'^]/g, '^').slice(-2).padStart(2, '^');
    const c = ch.toLowerCase();
    if (!/[a-z'$]/.test(c)) return Math.log(1 / this.V);        // digits, punctuation: neutral
    return Math.log(((this.tri.get(h + c) || 0) + this.k) / ((this.bi.get(h) || 0) + this.k * this.V));
  }
}
