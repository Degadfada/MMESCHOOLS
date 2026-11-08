// mmenyene/forge/DifficultyModel.js — how hard is this question likely to be?
//
// Before anyone has sat it, difficulty is PREDICTED from the shape of the item:
//   Bloom level of the template (remember < understand < apply < analyse),
//   how close the wrong options are to the right one, and whether they come from the
//   same topic (neighbours are hard to tell apart),
//   how specialised the vocabulary is,
//   and whether the right answer gives itself away by length.
// After real students sit it, the OBSERVED difficulty (share who got it wrong) is
// blended in, so the label becomes truer with every test.

export const LEVELS = ['easy', 'medium', 'hard'];
const BLOOM = { remember: 1.2, understand: 2.0, apply: 2.7, analyse: 3.2 };

export class DifficultyModel {
  predict({ bloom = 'remember', closeness = 0, sameTopic = 0, rarity = 0, lenSpread = 0, paraphrased = false }) {
    let d = BLOOM[bloom] ?? 1.5;
    d += 1.1 * sameTopic;
    d += 1.6 * Math.min(1, closeness * 1.6);
    d += 0.5 * rarity;
    d -= 0.8 * Math.min(1, lenSpread);
    if (paraphrased) d += 0.3;
    return Math.round(Math.max(1, Math.min(5, d)) * 10) / 10;
  }

  static level(score) { return score <= 2.3 ? 'easy' : score <= 3.4 ? 'medium' : 'hard'; }

  /** From a p-value (share correct) to the same 1..5 scale. */
  static fromPValue(p) { return Math.round((1 + 4 * (1 - p)) * 10) / 10; }

  /** Blend the prediction with observations; k is how much the prediction is trusted. */
  static blend(pred, obs, n, k = 6) {
    if (obs == null || !n) return pred;
    return Math.round(((pred * k + obs * n) / (k + n)) * 10) / 10;
  }

  /** How much the right answer stands out by length, 0..1. */
  static lenSpread(correct, wrong) {
    const mean = wrong.reduce((a, w) => a + w.length, 0) / wrong.length;
    return Math.abs(correct.length - mean) / Math.max(correct.length, mean, 1);
  }
}
