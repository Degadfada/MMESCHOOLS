// mmenyene/forge/Comprehender.js — read a teacher's notes into atoms.
//
// Classroom notes are written in a small number of recognisable shapes:
//   headings ("# Photosynthesis", "TOPIC: Rocks", a short capitalised line)
//   definitions ("X is …", "X – …", "X: …", "… is called X")
//   lists ("Types of rocks:" + bullets, or "The types of X are a, b and c")
//   steps (numbered lines under "process / stages / steps / how to")
//   causes ("… because …", "… leads to …", "… due to …")
//   plain sentences carrying a term, a figure or a name.
// The reader is deliberately conservative: it would rather miss an atom than invent
// one the teacher never wrote, because every question it feeds goes to a child.
import { Text, STOP } from '../../mme/text/Text.js';
import { Definition, Fact, ListAtom, Sequence, CauseEffect } from './atoms/Atoms.js';

const NOT_A_TERM = /^(?:it|its|this|that|these|those|they|there|he|she|we|you|i|if|when|while|but|and|so|also|then|a|an|the|date|week|day|note|notes|example|examples|e\.g|i\.e|summary|conclusion|introduction|today|my|our|some|many|most|all|each|every|one|another)\b/i;
const STEP_LABEL = /\b(?:steps?|stages?|process|procedure|order|sequence|cycle|how to|method|phases?|life ?cycle)\b/i;
const LIST_HEAD = /\b(?:types?|kinds?|examples?|parts?|classes|classification|components?|features?|functions?|uses?|properties|characteristics|branches|factors|causes|effects|importance|advantages|disadvantages|sources?|forms?|organs?|groups?|categories|elements|members|states|qualities|reasons|ways|methods|signs|symptoms)\b/i;
const UNIT = '(?:%|percent|per ?cent|°c|°f|degrees?(?: celsius)?|km|kilometres?|kilometers?|metres?|meters?|m|cm|mm|kg|g|grams?|tonnes?|litres?|liters?|ml|l|years?|months?|weeks?|days?|hours?|minutes?|seconds?|naira|kobo|people|states|chambers|bones|teeth|pairs?|legs|times)';
const NUM_RE = new RegExp(`(?<![\\w.])(\\d{1,3}(?:,\\d{3})+|\\d+(?:\\.\\d+)?)(\\s*${UNIT})?(?![\\w])`, 'gi');
const CAUSAL = [
  { re: /^(.{12,}?)\s*,?\s+because(?: of)?\s+(.{6,})$/i, effect: 1, cause: 2 },
  { re: /^(.{12,}?)\s*,?\s+due to\s+(.{6,})$/i, effect: 1, cause: 2 },
  { re: /^(.{6,}?)\s+(?:causes?|leads? to|results? in|brings? about|gives? rise to)\s+(.{6,})$/i, cause: 1, effect: 2 },
  { re: /^(.{12,}?)\s*[,;]\s*(?:therefore|as a result|hence|thus|so)\s*,?\s+(.{8,})$/i, cause: 1, effect: 2 }
];

export class Comprehender {
  constructor() {
    this.atoms = [];
    this.df = new Map();     // word -> number of sentences containing it
    this.sentenceCount = 0;
    this.capitalised = new Set();
  }

  /** notes: [{id, title, topic, body}] → this (atoms + vocabulary filled). */
  read(notes) {
    for (const n of notes) this._readNote(n);
    this._dedupe();
    this._attachFactKeys();
    return this;
  }

  // ── structure ────────────────────────────────────────────────────────────
  _readNote(note) {
    const topic = (note.topic || note.title || 'General').trim();
    let heading = note.title || topic;
    let label = null;                  // a "Types of X:" line that introduces the next list
    let block = null;
    const blocks = [];
    const close = () => { if (block && block.lines.length) blocks.push(block); block = null; };

    const LIST_LINE = /^(?:[-•*▪●◦·]|\(?[a-z]\)|\(?\d{1,2}[.)]|step\s*\d+)\s+/i;
    const all = String(note.body || '').split('\n').map(r => r.replace(/\s+/g, ' ').trim());
    for (let li = 0; li < all.length; li++) {
      const line = all[li];
      if (!line) { close(); continue; }
      // A short line with no full stop, right before a list, labels that list:
      // "Steps in blood clotting" / "Functions of the skeleton".
      const nextLine = all.slice(li + 1).find(Boolean) || '';
      if (LIST_LINE.test(nextLine) && !LIST_LINE.test(line) && !/[.!?]$/.test(line) && line.split(' ').length <= 10 && !/^#/.test(line)) {
        close(); label = Comprehender.cleanLabel(line); continue;
      }
      const md = line.match(/^#{1,6}\s+(.+)$/);
      const topicLine = line.match(/^(?:topic|sub-?topic|title|chapter|unit|lesson)\s*\d*\s*[:\-–]\s*(.+)$/i);
      if (md || topicLine || this._looksLikeHeading(line)) {
        close();
        heading = Text.trimEnd((md || topicLine || [, line])[1]).replace(/:$/, '');
        label = null;
        continue;
      }
      const bullet = line.match(/^(?:[-•*▪●◦·]|\(?[a-z]\))\s+(.+)$/i);
      const numbered = line.match(/^(?:\(?\d{1,2}[.)]|step\s*\d+\s*[:.\-–]?|(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)[.)])\s+(.+)$/i);
      if (bullet || numbered) {
        const kind = numbered ? 'numbered' : 'bullets';
        if (!block || block.kind !== kind) { close(); block = { kind, heading, label, lines: [], topic, noteId: note.id }; }
        block.lines.push((bullet || numbered)[1].trim());
        continue;
      }
      // "Types of rocks:" / "The functions of the skeleton are:" — introduces a list.
      if (/:$/.test(line) && line.split(' ').length <= 12) { close(); label = Comprehender.cleanLabel(line); continue; }
      if (!block || block.kind !== 'para') { close(); block = { kind: 'para', heading, label: null, lines: [], topic, noteId: note.id }; label = null; }
      block.lines.push(line);
    }
    close();
    for (const b of blocks) this._readBlock(b);
  }

  _looksLikeHeading(line) {
    if (line.length > 70 || /[.;,?!]$/.test(line)) return false;
    const w = line.split(' ');
    if (w.length > 8) return false;
    if (/\s(?:is|are|was|were|has|have|means|refers)\s/i.test(line)) return false;
    if (/:\s+\S/.test(line)) return false;
    if (line === line.toUpperCase() && /[A-Z]{3}/.test(line)) return true;
    return /^[A-Z]/.test(line) && w.filter(x => /^[A-Z]/.test(x)).length >= Math.ceil(w.length / 2);
  }

  _readBlock(b) {
    const ctx = { topic: b.topic, heading: b.heading, noteId: b.noteId };
    if (b.kind === 'para') {
      for (const s of Text.sentences(b.lines.join(' '))) this._readSentence(s, ctx);
      return;
    }
    const label = b.label || b.heading;
    const items = [];
    for (const line of b.lines) {
      const d = this._definition(line, ctx, true);
      if (d) { this.atoms.push(d); items.push(d.term); }
      else if (line.split(' ').length <= 6) items.push(Text.trimEnd(line));
      else { items.push(null); for (const s of Text.sentences(line)) this._readSentence(s, ctx, { skipDefinition: true }); }
    }
    const names = items.filter(Boolean);
    if (b.kind === 'numbered' && STEP_LABEL.test(label) && b.lines.length >= 3 && b.lines.length <= 8) {
      const steps = b.lines.map(l => Comprehender.shortStep(l));
      this.atoms.push(new Sequence({ ...ctx, label, steps, source: b.lines.join(' → ') }));
    } else if (names.length >= 3 && names.length === items.length) {
      this.atoms.push(new ListAtom({ ...ctx, label, items: names, source: `${label}: ${names.join(', ')}` }));
    }
  }

  _readSentence(s, ctx, { skipDefinition = false } = {}) {
    s = s.trim();
    const words = s.split(' ').length;
    if (words < 4) return;
    this._count(s);
    const d = skipDefinition ? null : this._definition(s, ctx, false);
    if (d) this.atoms.push(d);
    const list = this._inlineList(s, ctx);
    if (list) this.atoms.push(list);
    for (const c of CAUSAL) {
      const m = s.match(c.re);
      if (!m) continue;
      const cause = Text.trimEnd(m[c.cause]), effect = Text.trimEnd(m[c.effect]);
      if (cause.split(' ').length >= 2 && effect.split(' ').length >= 3) {
        this.atoms.push(new CauseEffect({ ...ctx, cause, effect, source: s }));
      }
      break;
    }
    if (words >= 6 && words <= 45 && !/\?$/.test(s)) {
      const fact = new Fact({ ...ctx, text: Text.trimEnd(s) + '.', source: s });
      // The term a sentence defines is "name it"'s job; a cloze must not blank it again.
      if (d) fact.defines = d.aliases.map(a => a.toLowerCase());
      this.atoms.push(fact);
    }
  }

  // ── definitions ──────────────────────────────────────────────────────────
  _definition(line, ctx, inList) {
    const p = line.replace(/^[•\-\s]+/, '').trim();
    let term, def;
    // "… is called X" / "… is known as X"
    let m = p.match(/^(.{15,}?)\s+(?:is|are)\s+(?:called|known as|referred to as|termed)\s+(?:the\s+|an?\s+)?([A-Za-z][\w\s'’\-]{1,40}?)[.]?$/i);
    if (m && m[2].split(' ').length <= 5) { term = m[2]; def = m[1]; }
    // "X – def" / "X: def"
    if (!term) {
      m = p.match(/^([A-Za-z][\w/&'’()\s.\-]{1,50}?)\s*(?:\s[-–—]\s|:)\s*(.{12,})$/);
      if (m && m[1].split(' ').length <= 6 && (inList || /^[A-Z]/.test(m[1]))) { term = m[1]; def = m[2]; }
    }
    // "X is/are (a|an|the) def", "X refers to / means / is defined as def"
    if (!term) {
      m = p.match(/^([A-Z][\w/&'’()\s\-]{1,50}?)\s+(?:is|are|refers? to|means|is defined as|can be defined as|is described as)\s+(.{12,})$/);
      if (m && m[1].split(' ').length <= 6) { term = m[1]; def = m[2]; }
    }
    if (!term) return null;
    term = Text.trimEnd(term).replace(/^(?:the|a|an)\s+/i, '');
    if (NOT_A_TERM.test(term) || term.length < 2 || /\d{3,}/.test(term)) return null;
    def = Comprehender.stripLead(def);
    if (def.split(' ').length < 3) return null;
    // "The three states of matter are solid, liquid and gas" is a list, not a definition.
    if (LIST_HEAD.test(term) || /^(?:two|three|four|five|six|seven|main|major|different)\b/i.test(term)) return null;
    if (/^[\w\s'-]{1,25}(?:,\s*[\w\s'-]{1,25})+,?\s+and\s+[\w\s'-]{1,25}\.?$/.test(def)) return null;
    const aliases = [term];
    const par = term.match(/^(.*?)\s*\(([^)]+)\)$/);
    if (par) { term = par[1].trim(); aliases.push(par[1].trim(), par[2].trim()); }
    return new Definition({ ...ctx, term: Text.capitalise(term), def: Text.capitalise(Text.trimEnd(def)), aliases, source: p });
  }

  static stripLead(def) {
    let s = def.trim().replace(/^[-–—:]\s*/, '');
    for (let i = 0; i < 4; i++) {
      const before = s;
      s = s.replace(/^(?:this|that|it)\s+(?:[a-z]+\s+)?(?=is\b|are\b)/i, '')
           .replace(/^(?:is|are|refers\s+to|means|stands\s+for|is defined as)\s+/i, '');
      if (s === before) break;
    }
    return s;
  }

  static cleanLabel(line) {
    return line.replace(/:$/, '').replace(/\s+(?:are|include|includes|is|as follows)$/i, '').replace(/^the\s+/i, '').trim();
  }

  static shortStep(line) {
    const d = line.match(/^([^:–—-]{2,40}?)\s*(?:[:–—]|\s-\s)/);
    const s = d ? d[1] : line;
    const w = Text.trimEnd(s).split(' ');
    return w.length > 8 ? w.slice(0, 8).join(' ') + '…' : w.join(' ');
  }

  _inlineList(s, ctx) {
    const m = s.match(/^(?:the\s+)?((?:main\s+|major\s+|different\s+|three\s+|four\s+|five\s+|two\s+)?[a-z ]{0,20}?(?:types?|kinds?|examples?|parts?|classes|components?|features?|functions?|uses?|properties|characteristics|branches|factors|causes|effects|sources?|forms?|organs?|groups?|states|stages|elements|members|arms|tiers|levels|layers|regions|zones|seasons|planets|continents|methods|ways|signs|symptoms)\s+of\s+[\w\s'’-]{2,40}?)\s+(?:are|include|includes|is)\s*:?\s+(.+?)\.?$/i)
      || s.match(/^([A-Z][\w\s'’-]{2,40}?)\s+(?:include|includes)\s*:?\s+(.+?)\.?$/);
    if (!m) return null;
    const items = m[2].split(/\s*,\s*|\s+and\s+|\s*;\s*/).map(x => Text.trimEnd(x.replace(/^(?:and|or|the|a|an)\s+/i, ''))).filter(Boolean);
    if (items.length < 3 || items.length > 10 || items.some(i => i.split(' ').length > 4)) return null;
    return new ListAtom({ ...ctx, label: Text.trimEnd(m[1]), items: items.map(Text.capitalise), source: s });
  }

  // ── vocabulary ───────────────────────────────────────────────────────────
  _count(s) {
    this.sentenceCount++;
    // Words written with a capital mid-sentence are names; they are never "key words".
    for (const m of s.slice(1).matchAll(/(?<=\s)([A-Z][a-z]{2,})/g)) this.capitalised.add(m[1].toLowerCase());
    for (const w of new Set(Text.content(s))) this.df.set(w, (this.df.get(w) || 0) + 1);
  }

  idf(word) {
    const n = this.df.get(Text.norm(word)) || 0;
    return Math.log((this.sentenceCount + 1) / (n + 1)) + 1;
  }

  /** 0..1, how specialised a phrase is within these notes. */
  rarity(phrase) {
    const ws = Text.content(phrase);
    if (!ws.length) return 0;
    const max = Math.log(this.sentenceCount + 1) + 1;
    return Math.min(1, ws.reduce((a, w) => a + this.idf(w), 0) / ws.length / max);
  }

  _dedupe() {
    const seen = new Map();
    for (const a of this.atoms) {
      const k = a.key;
      const prev = seen.get(k);
      // Two definitions of one term: keep the longer, clearer one.
      if (!prev || (a.kind === 'definition' && a.def.length > prev.def.length && a.def.length < 260)) seen.set(k, a);
    }
    this.atoms = [...seen.values()];
  }

  /** What each fact could blank out: a known term, a figure, a name, a key word. */
  _attachFactKeys() {
    const terms = this.of('definition').map(d => d.term).filter(t => t.length >= 3).sort((a, b) => b.length - a.length);
    for (const f of this.of('fact')) {
      const keys = [];
      for (const t of terms) {
        const m = f.text.match(new RegExp('\\b' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i'));
        // A term at the very start is the sentence defining it — "name it" covers that.
        if (m && m.index > 0) { keys.push({ text: m[0], kind: 'term' }); break; }
      }
      for (const m of f.text.matchAll(NUM_RE)) {
        const n = m[1].replace(/,/g, '');
        if (Number(n) === 0) continue;
        keys.push({ text: m[0].trim(), kind: 'number', value: Number(n), unit: (m[2] || '').trim(), raw: m[1] });
        break;
      }
      // A name: capitalised words mid-sentence, or a multi-word name at the start ("Mungo Park").
      const PROPER = /(?:[A-Z][a-z]{2,}(?:\s+(?:of\s+|de\s+)?[A-Z][a-z]{2,}){0,3})/g;
      for (const m of f.text.matchAll(PROPER)) {
        const name = m[0];
        if (m.index === 0 && !/\s/.test(name)) continue;
        if (STOP.has(name.toLowerCase()) || /^(?:The|This|These|They|When|What|There|In|It|However|For|Some|Most)\b/.test(name)) continue;
        keys.push({ text: name, kind: 'proper' });
        break;
      }
      const kw = Text.content(f.text)
        .filter(w => w.length >= 5 && !/(?:ly|ing|ed)$/.test(w) && !/^\d/.test(w) && !this.capitalised.has(w))
        .sort((a, b) => this.idf(b) * Math.sqrt(b.length) - this.idf(a) * Math.sqrt(a.length))[0];
      if (kw && !keys.some(k => k.text.toLowerCase().includes(kw))) keys.push({ text: kw, kind: 'keyword' });
      const own = f.defines || [];
      f.keys = keys.filter(k => !own.some(o => o === k.text.toLowerCase() || o.includes(k.text.toLowerCase())));
    }
  }

  of(kind) { return this.atoms.filter(a => a.kind === kind); }

  /** Pools of real material from the notes that distractors are drawn from. */
  pools() {
    if (this._pools) return this._pools;
    const facts = this.of('fact');
    const by = (kind) => facts.flatMap(f => f.keys.filter(k => k.kind === kind).map(k => ({ text: k.text, topic: f.topic, heading: f.heading })));
    this._pools = {
      terms: this.of('definition').map(d => ({ text: d.term, topic: d.topic, heading: d.heading, atom: d })),
      defs: this.of('definition').map(d => ({ text: d.maskedDef('it'), topic: d.topic, heading: d.heading, atom: d })),
      items: this.of('list').flatMap(l => l.items.map(i => ({ text: i, topic: l.topic, heading: l.heading, list: l }))),
      propers: by('proper'),
      keywords: by('keyword'),
      causes: this.of('cause').map(c => ({ text: c.cause, topic: c.topic, heading: c.heading })),
      effects: this.of('cause').map(c => ({ text: c.effect, topic: c.topic, heading: c.heading })),
      facts: facts.map(f => ({ text: f.text, topic: f.topic, heading: f.heading, atom: f }))
    };
    return this._pools;
  }

  stats() {
    const out = {};
    for (const a of this.atoms) out[a.kind] = (out[a.kind] || 0) + 1;
    return out;
  }
}
