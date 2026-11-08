// WhatIs — given the name, pick the description that really fits it.
import { QuestionTemplate } from './QuestionTemplate.js';
import { Text } from '../../../mme/text/Text.js';

export class WhatIs extends QuestionTemplate {
  static ID = 'what-is';
  static LABEL = 'What it is';
  static BLOOM = 'understand';
  static ATOMS = ['definition'];

  build(d, closeness) {
    const correct = Text.capitalise(Text.clip(d.maskedDef('it'), 170));
    if (correct.length < 12) return null;
    const pool = this.ctx.comprehender.pools().defs
      .filter(x => x.atom !== d)
      .map(x => ({ ...x, text: Text.capitalise(Text.clip(x.text, 170)) }));
    const p = this.ctx.picker.pick(correct, pool, { topic: d.topic, heading: d.heading, mode: 'text', closeness, forbid: d.aliases });
    if (!p) return null;
    const stem = this.ctx.rng.pick([`What is ${d.term}?`, `Which statement best describes ${d.term}?`, `${d.term} can be described as:`]);
    return this.make({ atom: d, stem, correct, wrong: p.texts, closeness: p.closeness, sameTopic: p.sameTopic, rarityOf: d.def });
  }
}
