// CauseEffectQ — given an effect from the notes, pick its cause (or the reverse).
import { QuestionTemplate } from './QuestionTemplate.js';
import { Text } from '../../../mme/text/Text.js';

export class CauseEffectQ extends QuestionTemplate {
  static ID = 'cause-effect';
  static LABEL = 'Cause and effect';
  static BLOOM = 'understand';
  static ATOMS = ['cause'];

  build(c, closeness) {
    const pools = this.ctx.comprehender.pools();
    const askCause = closeness === 'near' ? this.ctx.rng.next() < 0.6 : this.ctx.rng.next() < 0.4;
    const correct = Text.capitalise(askCause ? c.cause : c.effect);
    const given = askCause ? c.effect : c.cause;
    // Other causes/effects first; then clauses from other facts of similar length.
    const extra = pools.facts.filter(f => f.atom.source !== c.source).map(f => ({ ...f, text: Text.trimEnd(f.text) }))
      .filter(f => f.text.length < correct.length * 2.2);
    const pool = [...(askCause ? pools.causes : pools.effects), ...extra]
      .filter(x => Text.norm(x.text) !== Text.norm(given)).map(x => ({ ...x, text: Text.capitalise(Text.clip(x.text, 150)) }));
    const p = this.ctx.picker.pick(correct, pool, { topic: c.topic, heading: c.heading, mode: 'text', closeness });
    if (!p) return null;
    const stem = askCause
      ? `According to your notes, what is the cause of this? “${Text.capitalise(given)}.”`
      : `According to your notes, what does this lead to? “${Text.capitalise(given)}.”`;
    return this.make({ atom: c, stem, correct, wrong: p.texts, closeness: p.closeness, sameTopic: p.sameTopic, rarityOf: c.source });
  }
}
