// mmenyene/forge/atoms/Atoms.js — the units of knowledge the Comprehender reads out
// of a teacher's notes. Every question is built from one atom (or two, for
// "tell apart"), and every atom remembers the sentence it came from so a student's
// result can quote the teacher's own note back to them.
import { Text } from '../../../mme/text/Text.js';

export class Atom {
  constructor({ topic, heading, source, noteId }) {
    this.topic = topic || 'General';
    this.heading = heading || this.topic;
    this.source = source || '';
    this.noteId = noteId || null;
  }
  get kind() { return this.constructor.KIND; }
  get key() { return this.kind + ':' + Text.hash(this.identity()); }
  identity() { return this.source; }
}

/** "Photosynthesis is the process by which green plants make their food." */
export class Definition extends Atom {
  static KIND = 'definition';
  constructor(o) { super(o); this.term = o.term; this.def = o.def; this.aliases = o.aliases || [o.term]; }
  identity() { return Text.norm(this.term); }
  /** The definition with the term (and its aliases) hidden. */
  maskedDef(mask = 'it') {
    let d = this.def;
    for (const a of this.aliases.sort((x, y) => y.length - x.length)) {
      if (a.length < 2) continue;
      d = d.replace(new RegExp('\\b' + a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi'), mask);
    }
    return d;
  }
  /** What it does, if the definition says ("…carries oxygen…", "…used to measure…"). */
  purpose() {
    const m = this.def.match(/\b(?:is |are )?(?:used (?:to|for)|helps(?: to)?|allows?|enables?|responsible for|function is to|serves? to|works? to)\s+(.{8,120}?)(?:[.;]|$)/i);
    if (m) return m[0].replace(/^(?:is|are)\s+/i, '').replace(/[.;]$/, '');
    const v = this.def.match(/^(?:a|an|the)?\s*(?:[a-z]+\s){0,3}?(?:that|which|who)\s+((?:carr|produc|protect|stor|control|transport|absorb|convert|measur|break|digest|pump|connect|support|regulat|releas|form|make|help|allow|prevent|cause|filter)\w*\s.{6,110}?)(?:[.;]|$)/i);
    return v ? v[1] : null;
  }
}

/** A sentence worth asking about, with the word(s) a cloze can hide. */
export class Fact extends Atom {
  static KIND = 'fact';
  constructor(o) { super(o); this.text = o.text; this.keys = o.keys || []; }   // keys: [{text, kind: term|number|proper|keyword}]
}

/** "The types of rocks are igneous, sedimentary and metamorphic." */
export class ListAtom extends Atom {
  static KIND = 'list';
  constructor(o) { super(o); this.label = o.label; this.items = o.items; }
  identity() { return Text.norm(this.label) + '|' + this.items.map(Text.norm).join(','); }
}

/** Numbered steps under a "process / stages / how to" heading. */
export class Sequence extends Atom {
  static KIND = 'sequence';
  constructor(o) { super(o); this.label = o.label; this.steps = o.steps; }
  identity() { return Text.norm(this.label) + '|' + this.steps.map(Text.norm).join('>'); }
}

/** "Erosion occurs because water and wind wear away the soil." */
export class CauseEffect extends Atom {
  static KIND = 'cause';
  constructor(o) { super(o); this.cause = o.cause; this.effect = o.effect; }
}
