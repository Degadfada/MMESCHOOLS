// NameIt — given what it is (the teacher's own definition, term hidden), pick its name.
import { QuestionTemplate } from './QuestionTemplate.js';
import { Text } from '../../../mme/text/Text.js';

export class NameIt extends QuestionTemplate {
  static ID = 'name-it';
  static LABEL = 'Name it';
  static BLOOM = 'remember';
  static ATOMS = ['definition'];

  build(d, closeness) {
    const masked = d.maskedDef('____');
    if (masked.length < 15 || masked.length > 260) return null;
    const pool = this.ctx.comprehender.pools().terms.filter(t => t.atom !== d);
    const p = this.ctx.picker.pick(d.term, pool, { topic: d.topic, heading: d.heading, mode: 'name', closeness });
    if (!p) return null;
    const stem = this.ctx.rng.pick([
      `Which term is described here: “${Text.clip(masked, 240)}”?`,
      `“${Text.clip(masked, 240)}” — this describes:`,
      `What is the name for: ${Text.lowerFirst(Text.clip(masked, 240))}?`
    ]);
    return this.make({ atom: d, stem, correct: d.term, wrong: p.texts, closeness: p.closeness, sameTopic: p.sameTopic, rarityOf: d.term });
  }
}
