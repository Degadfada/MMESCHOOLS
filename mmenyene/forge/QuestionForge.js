// mmenyene/forge/QuestionForge.js — the "Spin" button.
//
// notes → Comprehender → atoms → every template × {near, far} → a pool of candidate
// questions, each with a predicted difficulty → a paper that honours the teacher's
// mix (e.g. 40% easy / 40% medium / 20% hard), spreads across topics, uses each
// piece of knowledge once, and varies the question shapes. A seed makes every spin
// reproducible; a new seed gives a fresh paper from the same notes.
import { Rng, Text } from '../../mme/text/Text.js';
import { Comprehender } from './Comprehender.js';
import { DistractorPicker } from './DistractorPicker.js';
import { DifficultyModel, LEVELS } from './DifficultyModel.js';
import { NameIt } from './templates/NameIt.js';
import { WhatIs } from './templates/WhatIs.js';
import { Cloze } from './templates/Cloze.js';
import { NumericPerturb } from './templates/NumericPerturb.js';
import { TrueStatement } from './templates/TrueStatement.js';
import { OddOneOut } from './templates/OddOneOut.js';
import { TellApart } from './templates/TellApart.js';
import { ApplyIt } from './templates/ApplyIt.js';
import { SequenceOrder } from './templates/SequenceOrder.js';
import { CauseEffectQ } from './templates/CauseEffectQ.js';

export const TEMPLATES = [NameIt, WhatIs, Cloze, NumericPerturb, TrueStatement, OddOneOut, TellApart, ApplyIt, SequenceOrder, CauseEffectQ];

export class QuestionForge {
  constructor({ model = new DifficultyModel() } = {}) { this.model = model; }

  static catalogue() {
    return TEMPLATES.map(T => ({ id: T.ID, label: T.LABEL, bloom: T.BLOOM }));
  }

  /** Every question the notes can support, before choosing. */
  candidates(notes, { seed = Date.now(), templates = null } = {}) {
    const rng = new Rng(seed);
    const comprehender = new Comprehender().read(notes);
    const ctx = { comprehender, picker: new DistractorPicker(rng), model: this.model, rng };
    const active = TEMPLATES.filter(T => !templates || !templates.length || templates.includes(T.ID)).map(T => new T(ctx));
    const out = [];
    for (const atom of comprehender.atoms) {
      for (const t of active) if (t.accepts(atom)) out.push(...t.generate(atom));
    }
    return { comprehender, candidates: out };
  }

  /**
   * @param notes  [{id,title,topic,body}]
   * @param opts   {count, mix:{easy,medium,hard} (weights), templates:[ids], seed,
   *                exclude: Set<fingerprint>, avoidAtoms: [atomKey]}
   */
  spin(notes, { count = 10, mix = { easy: 1, medium: 1, hard: 1 }, templates = null, seed = Date.now(), exclude = new Set(), avoidAtoms = [] } = {}) {
    const { comprehender, candidates } = this.candidates(notes, { seed, templates });
    const rng = new Rng(Number(seed) + 7);
    const avoid = new Set(avoidAtoms);
    const pool = candidates.filter(c => !exclude.has(c.fingerprint) && !avoid.has(c.atomKey));

    const want = QuestionForge.allocate(count, mix);
    const byLevel = Object.fromEntries(LEVELS.map(l => [l, rng.shuffle(pool.filter(c => c.level === l))]));
    const available = Object.fromEntries(LEVELS.map(l => [l, new Set(byLevel[l].map(c => c.atomKey)).size]));

    const usedAtoms = new Set();
    const templateUse = new Map();
    const topicUse = new Map();
    const chosen = [];
    const shortages = {};

    const take = (level, n) => {
      let got = 0;
      while (got < n) {
        const list = byLevel[level].filter(c => !usedAtoms.has(c.atomKey));
        if (!list.length) break;
        // Least-used topic first, then least-used template shape, then random.
        list.sort((a, b) =>
          ((topicUse.get(a.topic) || 0) - (topicUse.get(b.topic) || 0)) * 2 +
          ((templateUse.get(a.template) || 0) - (templateUse.get(b.template) || 0)));
        const best = list[0];
        usedAtoms.add(best.atomKey);
        topicUse.set(best.topic, (topicUse.get(best.topic) || 0) + 1);
        templateUse.set(best.template, (templateUse.get(best.template) || 0) + 1);
        chosen.push(best);
        got++;
      }
      return got;
    };

    for (const level of LEVELS) {
      const got = take(level, want[level]);
      if (got < want[level]) shortages[level] = want[level] - got;
    }
    // Fill any shortage from the nearest level, so the teacher still gets her count.
    const borrowOrder = { easy: ['medium', 'hard'], medium: ['easy', 'hard'], hard: ['medium', 'easy'] };
    for (const level of LEVELS) {
      let need = shortages[level] || 0;
      for (const alt of borrowOrder[level]) { if (need > 0) need -= take(alt, need); }
    }

    // Easy first, as a paper should warm up; topics stay mixed within a level.
    const rank = { easy: 0, medium: 1, hard: 2 };
    chosen.sort((a, b) => rank[a.level] - rank[b.level]);

    return {
      seed,
      questions: chosen.map((q, i) => ({ ...q, uid: `${seed}-${i}-${q.fingerprint}` })),
      stats: {
        atoms: comprehender.stats(), candidates: candidates.length,
        available, wanted: want, shortages,
        got: Object.fromEntries(LEVELS.map(l => [l, chosen.filter(c => c.level === l).length]))
      }
    };
  }

  /** Split `count` across levels in proportion to the weights (largest remainder). */
  static allocate(count, mix) {
    const w = LEVELS.map(l => Math.max(0, Number(mix[l]) || 0));
    const total = w.reduce((a, b) => a + b, 0) || 1;
    const raw = w.map(x => (x / total) * count);
    const base = raw.map(Math.floor);
    let left = count - base.reduce((a, b) => a + b, 0);
    raw.map((r, i) => [r - base[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { base[i]++; left--; } });
    return Object.fromEntries(LEVELS.map((l, i) => [l, base[i]]));
  }

  static normaliseEdited(q) {
    const options = (q.options || []).map(o => String(o).trim()).filter(Boolean);
    if (options.length < 2) throw new Error('a question needs at least two options');
    const answer = Number(q.answer);
    if (!(answer >= 0 && answer < options.length)) throw new Error('mark the right answer');
    if (!String(q.stem || '').trim()) throw new Error('the question is empty');
    return { ...q, stem: String(q.stem).trim(), options, answer, fingerprint: q.fingerprint || Text.hash(q.stem + options[answer]) };
  }
}
