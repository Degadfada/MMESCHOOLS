// SequenceOrder — which option lists the steps in the right order?
import { QuestionTemplate } from './QuestionTemplate.js';
import { Text } from '../../../mme/text/Text.js';

export class SequenceOrder extends QuestionTemplate {
  static ID = 'sequence';
  static LABEL = 'Right order';
  static BLOOM = 'analyse';
  static ATOMS = ['sequence'];

  build(s, closeness) {
    const steps = s.steps.slice(0, 6);
    if (steps.length < 3) return null;
    const show = (arr) => arr.join(' → ');
    const variants = [];
    const swap = (i) => { const a = steps.slice(); [a[i], a[i + 1]] = [a[i + 1], a[i]]; return a; };
    if (closeness === 'near') for (let i = 0; i < steps.length - 1; i++) variants.push(swap(i));
    variants.push(steps.slice().reverse(), [...steps.slice(1), steps[0]], [steps[steps.length - 1], ...steps.slice(0, -1)]);
    if (closeness !== 'near') variants.push(swap(0));
    const wrong = [];
    for (const v of this.ctx.rng.shuffle(variants)) {
      const t = show(v);
      if (t !== show(steps) && !wrong.includes(t)) wrong.push(t);
      if (wrong.length === 3) break;
    }
    return this.make({
      atom: s, stem: `What is the correct order of ${Text.lowerFirst(s.label)}?`, correct: show(steps), wrong,
      closeness: closeness === 'near' ? 0.9 : 0.6, sameTopic: 1, rarityOf: steps.join(' ')
    });
  }
}
