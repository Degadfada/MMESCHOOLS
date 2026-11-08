// TellApart — two neighbouring terms from the same heading; match each to what it is.
// The wrong options swap or substitute the pairings.
import { QuestionTemplate } from './QuestionTemplate.js';
import { Text } from '../../../mme/text/Text.js';

export class TellApart extends QuestionTemplate {
  static ID = 'tell-apart';
  static LABEL = 'Tell them apart';
  static BLOOM = 'analyse';
  static ATOMS = ['definition'];

  build(a, closeness) {
    const defs = this.ctx.comprehender.of('definition').filter(d => d !== a);
    const near = defs.filter(d => d.heading === a.heading || d.topic === a.topic);
    const pool = closeness === 'near' ? near : defs.filter(d => !near.includes(d));
    if (pool.length < 2) return null;
    const [b, c] = this.ctx.rng.shuffle(pool);
    const short = (d) => Text.clip(d.maskedDef('it'), 70);
    const sa = short(a), sb = short(b), sc = short(c);
    if (new Set([sa, sb, sc].map(Text.norm)).size < 3) return null;
    const pair = (x, y) => `${a.term}: ${x} | ${b.term}: ${y}`;
    return this.make({
      atom: a,
      stem: `Which option correctly matches ${a.term} and ${b.term} to what each one is?`,
      correct: pair(sa, sb), wrong: [pair(sb, sa), pair(sa, sc), pair(sc, sb)],
      closeness: Text.similar(a.def, b.def) + 0.25, sameTopic: closeness === 'near' ? 1 : 0.2,
      rarityOf: a.def + ' ' + b.def
    });
  }
}
