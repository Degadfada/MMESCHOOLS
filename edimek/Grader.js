// edimek/Grader.js — marking happens here, on the server. The answer key never goes to
// a student's browser until their result is visible (same rule as the IDA Tech app).
import { Rng } from '../mme/text/Text.js';

export class Grader {
  /** A per-student layout: question order and each question's option order. */
  static layout(paper, { shuffleQuestions = true, shuffleOptions = true } = {}, seed = Date.now()) {
    const rng = new Rng(seed);
    const order = shuffleQuestions ? rng.shuffle(paper.map(q => q.qid)) : paper.map(q => q.qid);
    const perm = {};
    for (const q of paper) {
      const idx = q.options.map((_, i) => i);
      perm[q.qid] = shuffleOptions ? rng.shuffle(idx) : idx;
    }
    return { order, perm };
  }

  constructor(test) {
    this.test = test;
    this.byId = new Map(test.paper.map(q => [q.qid, q]));
  }

  question(qid) { return this.byId.get(qid); }

  /** Displayed choice → original option index → correct? */
  mark(layout, qid, shown) {
    const q = this.byId.get(qid);
    if (!q) return null;
    const perm = layout.perm[qid];
    const i = Number(shown);
    if (!(i >= 0 && i < perm.length)) return null;
    const original = perm[i];
    return { original, correct: original === q.answer };
  }

  /** The paper as one student sees it: their order, their option order, no answers. */
  publicPaper(layout) {
    return layout.order.map((qid, n) => {
      const q = this.byId.get(qid);
      return { qid, n: n + 1, stem: q.stem, options: layout.perm[qid].map(i => q.options[i]) };
    });
  }

  score(responses) {
    let score = 0;
    for (const q of this.test.paper) { const r = responses.get(q.qid); if (r && r.correct) score++; }
    return { score, max: this.test.paper.length };
  }

  /** Full corrections for a student whose result is visible. */
  review(layout, responses, { showCorrections = true, showSource = true } = {}) {
    return layout.order.map((qid, n) => {
      const q = this.byId.get(qid);
      const perm = layout.perm[qid];
      const r = responses.get(qid);
      const chosen = r && r.choice != null ? perm.indexOf(r.choice) : null;   // stored choice is original index
      return {
        n: n + 1, stem: q.stem, options: perm.map(i => q.options[i]), chosen,
        correct: r ? !!r.correct : false,
        answer: showCorrections ? perm.indexOf(q.answer) : null,
        source: showCorrections && showSource ? q.source || null : null
      };
    });
  }

  static band(pct) {
    if (pct >= 75) return 'Excellent';
    if (pct >= 60) return 'Very good';
    if (pct >= 50) return 'Good';
    if (pct >= 40) return 'Fair';
    return 'Needs more practice';
  }
}
