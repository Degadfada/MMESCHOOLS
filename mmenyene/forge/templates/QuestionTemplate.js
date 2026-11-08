// mmenyene/forge/templates/QuestionTemplate.js — the base every question shape extends.
//
// A template turns one atom into a four-option question with exactly one right
// answer. It is asked twice per atom — once with 'near' distractors (neighbours that
// are hard to tell apart) and once with 'far' ones — which gives the Forge the same
// knowledge at different difficulties to choose from.
import { Text } from '../../../mme/text/Text.js';
import { DifficultyModel } from '../DifficultyModel.js';

export class QuestionTemplate {
  static ID = 'base';
  static LABEL = 'Question';
  static BLOOM = 'remember';
  static ATOMS = [];

  /** @param ctx {{comprehender, picker, model, rng}} */
  constructor(ctx) { this.ctx = ctx; }

  get id() { return this.constructor.ID; }
  accepts(atom) { return this.constructor.ATOMS.includes(atom.kind); }

  /** Subclasses implement: return the result of this.make(...) or null. */
  // eslint-disable-next-line no-unused-vars
  build(atom, closeness) { throw new Error('build() not implemented in ' + this.constructor.name); }

  generate(atom) {
    const out = [];
    for (const cl of ['near', 'far']) {
      let q = null;
      try { q = this.build(atom, cl); } catch { q = null; }
      if (q && !out.some(o => o.options.join('|') === q.options.join('|'))) out.push(q);
    }
    return out;
  }

  make({ atom, stem, correct, wrong, closeness = 0, sameTopic = 0, paraphrased = false, rarityOf, bloom }) {
    if (!wrong || wrong.length < 3 || !correct) return null;
    const all = [correct, ...wrong.slice(0, 3)].map(s => Text.clip(String(s), 220));
    if (new Set(all.map(Text.norm)).size !== 4) return null;
    const order = this.ctx.rng.shuffle([0, 1, 2, 3]);
    const options = order.map(i => all[i]);
    const b = bloom || this.constructor.BLOOM;
    const features = {
      bloom: b, closeness, sameTopic, paraphrased,
      rarity: this.ctx.comprehender.rarity(rarityOf || all[0]),
      lenSpread: DifficultyModel.lenSpread(all[0], all.slice(1))
    };
    const difficulty = this.ctx.model.predict(features);
    return {
      template: this.id, label: this.constructor.LABEL, bloom: b,
      topic: atom.topic, heading: atom.heading,
      stem, options, answer: order.indexOf(0),
      source: atom.source, noteId: atom.noteId, atomKey: atom.key,
      fingerprint: Text.hash(this.id + '|' + atom.key + '|' + Text.norm(all[0])),
      difficulty, level: DifficultyModel.level(difficulty), features
    };
  }
}
