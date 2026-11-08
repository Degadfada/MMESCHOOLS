// OddOneOut — "Which of these is NOT one of the types of rocks?" (near) and its
// easier mirror, "Which of these IS one of the types of rocks?" (far).
import { QuestionTemplate } from './QuestionTemplate.js';
import { Text } from '../../../mme/text/Text.js';

export class OddOneOut extends QuestionTemplate {
  static ID = 'odd-one-out';
  static LABEL = 'Odd one out';
  static BLOOM = 'understand';
  static ATOMS = ['list'];

  outsiders(l) {
    const p = this.ctx.comprehender.pools();
    const inList = new Set(l.items.map(Text.norm));
    return [...p.items.filter(x => x.list !== l), ...p.terms].filter(x => !inList.has(Text.norm(x.text)));
  }

  build(l, closeness) {
    const label = Text.lowerFirst(l.label);
    if (closeness === 'near') {
      const p = this.ctx.picker.pick(l.items[0], this.outsiders(l), { topic: l.topic, heading: l.heading, mode: 'name', closeness: 'near', n: 1 });
      if (!p) return null;
      const members = this.ctx.rng.shuffle(l.items).slice(0, 3);
      return this.make({
        atom: l, stem: `Which of these is NOT one of the ${label}?`, correct: p.texts[0], wrong: members,
        closeness: p.closeness, sameTopic: p.sameTopic, rarityOf: l.items.join(' ')
      });
    }
    const member = this.ctx.rng.pick(l.items);
    const p = this.ctx.picker.pick(member, this.outsiders(l), { topic: l.topic, heading: l.heading, mode: 'name', closeness: 'far' });
    if (!p) return null;
    return this.make({
      atom: l, stem: `Which of these is one of the ${label}?`, correct: member, wrong: p.texts,
      closeness: p.closeness, sameTopic: p.sameTopic, rarityOf: member, bloom: 'remember'
    });
  }
}
