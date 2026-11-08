// NumericPerturb — the right figure against believable wrong ones.
import { QuestionTemplate } from './QuestionTemplate.js';

export class NumericPerturb extends QuestionTemplate {
  static ID = 'number';
  static LABEL = 'The right figure';
  static BLOOM = 'remember';
  static ATOMS = ['fact'];

  build(f, closeness) {
    const key = f.keys.find(k => k.kind === 'number');
    if (!key) return null;
    const blanked = f.text.replace(key.text, '______');
    if (blanked === f.text) return null;
    const nums = this.ctx.picker.numbers(key.value, key.raw, closeness);
    if (!nums) return null;
    const unit = key.unit ? ' ' + key.unit : '';
    const wrong = nums.map(n => n + unit);
    return this.make({
      atom: f, stem: `Fill in the gap: “${blanked}”`, correct: key.text, wrong,
      closeness: closeness === 'near' ? 0.55 : 0.1, sameTopic: closeness === 'near' ? 0.7 : 0.2,
      rarityOf: f.text, bloom: 'remember'
    });
  }
}
