// Cloze — the teacher's sentence with its key word blanked out.
import { QuestionTemplate } from './QuestionTemplate.js';


const POOL = { term: 'terms', proper: 'propers', keyword: 'keywords' };

export class Cloze extends QuestionTemplate {
  static ID = 'cloze';
  static LABEL = 'Fill the gap';
  static BLOOM = 'remember';
  static ATOMS = ['fact'];

  build(f, closeness) {
    const key = f.keys.find(k => k.kind in POOL);
    if (!key) return null;
    const esc = key.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('\\b' + esc + '\\b', 'gi');
    const blanked = f.text.replace(re, '______');
    if (!blanked.includes('______') || blanked.length > 300) return null;
    const pools = this.ctx.comprehender.pools();
    let pool = pools[POOL[key.kind]];
    if (key.kind === 'keyword') {
      // Keep the same "shape" of word, so the grammar of the sentence does not give it away.
      const plural = /s$/.test(key.text);
      pool = pool.filter(x => /s$/.test(x.text) === plural);
    }
    pool = pool.filter(x => !new RegExp('\\b' + x.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(f.text));
    const correct = key.kind === 'keyword' ? key.text.toLowerCase() : key.text;
    const p = this.ctx.picker.pick(correct, pool.map(x => ({ ...x, text: key.kind === 'keyword' ? x.text.toLowerCase() : x.text })),
      { topic: f.topic, heading: f.heading, mode: 'name', closeness });
    if (!p) return null;
    const stem = `Fill in the gap: “${blanked}”`;
    return this.make({ atom: f, stem, correct, wrong: p.texts, closeness: p.closeness, sameTopic: p.sameTopic, rarityOf: key.text });
  }
}

