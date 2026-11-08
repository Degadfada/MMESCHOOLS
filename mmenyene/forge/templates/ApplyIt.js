// ApplyIt — a need is stated (taken from what the definition says it does); pick the
// one thing from the topic that meets it.
import { QuestionTemplate } from './QuestionTemplate.js';
import { Text } from '../../../mme/text/Text.js';

export class ApplyIt extends QuestionTemplate {
  static ID = 'apply-it';
  static LABEL = 'Apply it';
  static BLOOM = 'apply';
  static ATOMS = ['definition'];

  build(d, closeness) {
    let purpose = d.purpose();
    if (!purpose) return null;
    purpose = Text.lowerFirst(Text.trimEnd(purpose));
    for (const al of d.aliases) if (new RegExp('\\b' + al.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(purpose)) return null;
    const pool = this.ctx.comprehender.pools().terms.filter(t => t.atom !== d);
    const p = this.ctx.picker.pick(d.term, pool, { topic: d.topic, heading: d.heading, mode: 'name', closeness });
    if (!p) return null;
    const stem = this.ctx.rng.pick([
      `In ${d.topic}, which one ${purpose.replace(/^(?:is |are )/, 'is ')}?`,
      `Which of these ${purpose}?`
    ]);
    return this.make({ atom: d, stem, correct: d.term, wrong: p.texts, closeness: p.closeness, sameTopic: p.sameTopic, paraphrased: true, rarityOf: d.term });
  }
}
