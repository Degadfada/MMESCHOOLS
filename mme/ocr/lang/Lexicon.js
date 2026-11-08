// mme/ocr/lang/Lexicon.js — words the reader expects to see: a general English list
// plus — weighted much higher — every word in the teacher's own notes for that subject.

export class Lexicon {
  constructor() { this.freq = new Map(); this.total = 0; }

  /** words in rank order (most common first). */
  addRanked(words, weight = 1) {
    words.forEach((w, i) => this.add(w, weight * (1000 / (i + 10))));
    return this;
  }

  addText(text, weight = 30) {
    for (const w of String(text).toLowerCase().match(/[a-z][a-z'-]*[a-z]|[a-z]/g) || []) this.add(w, weight);
    return this;
  }

  add(word, n = 1) {
    const w = String(word).toLowerCase().trim();
    if (!w || w.length > 30) return;
    this.freq.set(w, (this.freq.get(w) || 0) + n);
    this.total += n;
  }

  has(word) { return this.freq.has(String(word).toLowerCase()); }
  logp(word) {
    const f = this.freq.get(String(word).toLowerCase());
    return f ? Math.log(f / this.total) : null;
  }
  get size() { return this.freq.size; }
  words() { return [...this.freq.keys()]; }
}
