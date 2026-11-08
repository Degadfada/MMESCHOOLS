// TrueStatement — one statement exactly as the notes have it; three others from the
// notes with their key fact swapped, so they are false.
import { QuestionTemplate } from './QuestionTemplate.js';
import { Text } from '../../../mme/text/Text.js';

export class TrueStatement extends QuestionTemplate {
  static ID = 'true-statement';
  static LABEL = 'Which is true';
  static BLOOM = 'understand';
  static ATOMS = ['fact'];

  corrupt(fact, closeness) {
    const pools = this.ctx.comprehender.pools();
    for (const key of fact.keys.filter(k => k.kind !== 'keyword')) {
      let swap = null;
      if (key.kind === 'number') {
        const n = this.ctx.picker.numbers(key.value, key.raw, closeness);
        if (n) swap = n[0] + (key.unit ? ' ' + key.unit : '');
      } else {
        // Swap a term only for a NEIGHBOUR (same heading or topic): "melting" for
        // "evaporation" makes a believable false statement; "skull" for it makes nonsense.
        let pool = (key.kind === 'term' ? pools.terms : pools.propers)
          .filter(x => !fact.text.toLowerCase().includes(x.text.toLowerCase()));
        if (key.kind === 'term') pool = pool.filter(x => x.heading === fact.heading || x.topic === fact.topic);
        const p = this.ctx.picker.pick(key.text, pool, { topic: fact.topic, heading: fact.heading, mode: 'name', closeness, n: 1 });
        if (p) swap = /^[a-z]/.test(key.text) && key.kind === 'term' ? p.texts[0].toLowerCase() : p.texts[0];
      }
      if (!swap) continue;
      const out = fact.text.replace(key.text, swap);
      if (out !== fact.text) return out;
    }
    return null;
  }

  build(f, closeness) {
    if (f.text.length > 170) return null;
    const others = this.ctx.rng.shuffle(this.ctx.comprehender.of('fact').filter(x => x !== f && x.keys.some(k => k.kind !== 'keyword') && x.text.length <= 170));
    others.sort((a, b) => (closeness === 'near' ? 1 : -1) * ((b.topic === f.topic) - (a.topic === f.topic)));
    const wrong = [];
    for (const o of others) {
      if (wrong.length === 3) break;
      if (Text.similar(o.text, f.text) > 0.6) continue;
      const bad = this.corrupt(o, closeness);
      if (bad && !wrong.includes(bad)) wrong.push(bad);
    }
    if (wrong.length < 3) {
      // Fall back to corrupting the statement itself, differently each time.
      const self = this.corrupt(f, closeness === 'near' ? 'far' : 'near');
      if (self && !wrong.includes(self)) wrong.push(self);
    }
    if (wrong.length < 3) return null;
    const sameTopic = others.slice(0, 3).filter(o => o.topic === f.topic).length / 3;
    return this.make({
      atom: f, stem: 'According to your notes, which of these statements is correct?', correct: f.text, wrong,
      closeness: closeness === 'near' ? 0.4 : 0.15, sameTopic, rarityOf: f.text
    });
  }
}
