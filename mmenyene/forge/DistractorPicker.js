// mmenyene/forge/DistractorPicker.js — choosing the three wrong answers.
//
// Ported from the IDA Tech cert app's lib/mcq.js. The wrong options are the whole
// difficulty of a multiple-choice question: obviously silly ones test nothing, and
// accidentally-true ones are unfair. So distractors are never invented — they are
// real material from elsewhere in the teacher's notes — and they are filtered:
//   * a distractor that restates the right answer is rejected;
//   * names that contain each other ("Cell" vs "Cell wall") are never paired;
//   * lengths are matched, so "pick the longest" is not a winning strategy.
// The teacher's difficulty setting acts here: 'near' prefers neighbours from the same
// heading/topic that resemble the answer (hard to tell apart); 'far' prefers material
// from other topics (easy to rule out).
import { Text } from '../../mme/text/Text.js';

function bigrams(s) {
  const t = Text.norm(s).replace(/ /g, '');
  const out = new Set();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}
function dice(a, b) {
  const A = bigrams(a), B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const x of A) if (B.has(x)) n++;
  return (2 * n) / (A.size + B.size);
}

export class DistractorPicker {
  constructor(rng) { this.rng = rng; }

  static clash(a, b, mode) {
    const A = Text.norm(a), B = Text.norm(b);
    if (!A || !B || A === B) return true;
    if (mode === 'name' || mode === 'number') {
      const wa = ` ${A} `, wb = ` ${B} `;
      return wa.includes(wb) || wb.includes(wa);
    }
    return Text.similar(a, b) >= 0.5;
  }

  static resemblance(a, b, mode) { return mode === 'text' ? Text.similar(a, b) : dice(a, b); }

  /**
   * @param correct  the right answer text
   * @param pool     [{text, topic, heading}]
   * @param ctx      {topic, heading, mode:'name'|'text', closeness:'near'|'far', forbid:[strings that must not appear]}
   * @returns null, or {texts:[3], closeness:0..1, sameTopic:0..1}
   */
  pick(correct, pool, { topic, heading, mode = 'text', closeness = 'near', forbid = [], n = 3 } = {}) {
    const forbidden = forbid.filter(Boolean).map(f => Text.norm(f)).filter(f => f.length >= 3);
    const seen = new Set();
    const cands = [];
    for (const c of pool) {
      const key = Text.norm(c.text);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      if (DistractorPicker.clash(correct, c.text, mode)) continue;
      if (forbidden.some(f => (' ' + key + ' ').includes(' ' + f + ' '))) continue;
      const same = c.heading === heading ? 1 : c.topic === topic ? 0.6 : 0;
      const res = DistractorPicker.resemblance(correct, c.text, mode);
      const len = Math.abs(c.text.length - correct.length) / Math.max(correct.length, c.text.length, 1);
      const jitter = this.rng ? this.rng.next() * 0.25 : 0;
      const score = closeness === 'near'
        ? same * 1.2 + res * 0.8 - len * 0.9 + jitter
        : (1 - same) * 1.0 - res * 0.6 - len * 0.9 + jitter;
      cands.push({ text: c.text, same, res, score });
    }
    cands.sort((a, b) => b.score - a.score);
    const out = [];
    const taken = [correct];
    for (const c of cands) {
      if (out.length >= n) break;
      if (taken.some(t => DistractorPicker.clash(t, c.text, mode))) continue;
      out.push(c); taken.push(c.text);
    }
    if (out.length < n) return null;
    return {
      texts: out.map(c => c.text),
      closeness: out.reduce((a, c) => a + c.res, 0) / n,
      sameTopic: out.reduce((a, c) => a + c.same, 0) / n
    };
  }

  /** Plausible wrong figures for a number: near = close neighbours, far = obviously off. */
  numbers(value, raw, closeness = 'near') {
    const isYear = /^\d{4}$/.test(raw) && value >= 1000 && value <= 2100;
    const decimals = (raw.split('.')[1] || '').length;
    const fmt = (x) => {
      const v = decimals ? x.toFixed(decimals) : String(Math.round(x));
      return raw.includes(',') ? Number(v).toLocaleString('en-US') : v;
    };
    let steps;
    if (isYear) steps = closeness === 'near' ? [-1, 1, -2, 2, -3, 3, 5, -5] : [-10, 10, -20, 20, -50, 50, 15];
    else if (Number.isInteger(value) && value <= 12) steps = closeness === 'near' ? [-1, 1, 2, -2, 3, 4] : [3, 5, 7, -3, 9, 6];
    else steps = (closeness === 'near' ? [0.9, 1.1, 0.8, 1.2, 1.25, 0.75] : [0.5, 2, 3, 0.25, 1.5, 10]).map(f => value * f - value);
    const seen = new Set([fmt(value)]);
    const out = [];
    for (const s of (this.rng ? this.rng.shuffle(steps) : steps)) {
      let x = value + s;
      if (x <= 0) continue;
      if (/%|percent/.test(raw) && x > 100) continue;
      if (!isYear && !decimals) x = DistractorPicker.round(x, value);
      const t = fmt(x);
      if (seen.has(t)) continue;
      seen.add(t); out.push(t);
      if (out.length === 3) break;
    }
    return out.length === 3 ? out : null;
  }

  /** Round to the same "shape" as the original (250 → 300 not 312). */
  static round(x, like) {
    const z = String(Math.round(like)).match(/0*$/)[0].length;
    const p = Math.pow(10, Math.min(z, Math.max(0, String(Math.round(x)).length - 1)));
    return Math.max(1, Math.round(x / p) * p);
  }
}
