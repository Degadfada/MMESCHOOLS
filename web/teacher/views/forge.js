// The Spin button: read the notes, make a paper at the difficulty the teacher asks for.
// Lock the questions you like, re-spin the rest, edit or reject any one.
import { h, mount, toast, modal, field } from '../../shared/dom.js';
import { api } from '../../shared/api.js';
import { ShareSheet } from '../../shared/share.js';
import { View } from '../View.js';
import { createTestDialog } from './tests.js';

const PRESETS = { 'Easy paper': { easy: 6, medium: 3, hard: 1 }, Balanced: { easy: 4, medium: 4, hard: 2 }, Challenging: { easy: 1, medium: 4, hard: 5 } };

export class ForgeView extends View {
  async render(root) {
    const t = await this.app.teaching(this.params.tid);
    this.t = t;
    this.app.renderBar([{ label: 'My classes', href: '#/' }, { label: `${t.subject} · ${t.class_name}`, href: `#/c/${t.id}` }, { label: 'Spin questions' }]);
    const [{ notes }, templates] = await Promise.all([api.get(`/api/teachings/${t.id}/notes`), api.get('/api/forge/templates')]);
    this.notes = notes;
    this.templates = templates;
    this.settings = this.settings || { count: 10, mix: { ...PRESETS.Balanced }, templates: new Set(templates.map(x => x.id)), noteIds: new Set(notes.map(n => n.id)) };
    this.paper = this.paper || [];
    this.root = root;
    this.draw();
  }

  draw() {
    const s = this.settings;
    if (!this.notes.length) {
      return mount(this.root, h('div.card.empty', h('h2', 'Add notes first'), h('p', 'The spinner makes questions by reading your notes for this class.'), h('a.btn.primary', { href: `#/c/${this.t.id}/note/new` }, 'Write a note')));
    }
    const slider = (k) => {
      const out = h('b', String(s.mix[k]));
      return h('div.mix', h('span.badge', { class: k }, k), h('input', { type: 'range', min: 0, max: 10, value: s.mix[k], oninput: (e) => { s.mix[k] = Number(e.target.value); out.textContent = e.target.value; } }), out);
    };
    const spinBtn = h('button.primary.big.spin-btn', { onclick: () => this.spin(spinBtn) }, h('span.wheel', '🎡'), this.paper.length ? ' Spin again' : ' Spin');
    mount(this.root,
      h('div.card.stack',
        h('div.row.between', h('h2', 'Spin questions'), h('span.muted', `${this.notes.length} notes · ${s.noteIds.size} selected`)),
        h('div.row', { style: { alignItems: 'flex-start', gap: '20px' } },
          h('div', { style: { flex: '1 1 260px' } },
            field('How many questions', h('input', { type: 'number', min: 1, max: 100, value: s.count, oninput: (e) => { s.count = Number(e.target.value) || 10; } })),
            h('div.field', h('label', 'Difficulty mix'),
              h('div.row', { style: { marginBottom: '6px' } }, Object.keys(PRESETS).map(p => h('button.small', { onclick: () => { s.mix = { ...PRESETS[p] }; this.draw(); } }, p))),
              slider('easy'), slider('medium'), slider('hard'))),
          h('div', { style: { flex: '1 1 260px' } },
            h('div.field', h('label', 'Read these notes'),
              h('div', { style: { maxHeight: '170px', overflow: 'auto', border: '1px solid var(--line)', borderRadius: '10px', padding: '6px 10px' } },
                this.notes.map(n => h('label.check', h('input', { type: 'checkbox', checked: s.noteIds.has(n.id), onchange: (e) => { e.target.checked ? s.noteIds.add(n.id) : s.noteIds.delete(n.id); } }), n.title)))),
            h('div.field', h('label', 'Kinds of question'),
              h('div.row', this.templates.map(tp => h('button.small', {
                class: s.templates.has(tp.id) ? 'primary' : '', title: tp.bloom,
                onclick: (e) => { s.templates.has(tp.id) ? s.templates.delete(tp.id) : s.templates.add(tp.id); e.target.classList.toggle('primary'); }
              }, tp.label)))))),
        h('div.row', spinBtn, this.paper.length > 0 && h('span.muted', 'Locked questions stay; the rest are replaced.'))),
      this.stats && h('p.muted', { style: { margin: '10px 4px' } }, this.statsLine()),
      this.paper.length > 0 && h('div.stack', { style: { marginTop: '12px' } }, this.paper.map((q, i) => this.card(q, i))),
      this.paper.length > 0 && h('div.card.row', { style: { position: 'sticky', bottom: '8px', marginTop: '14px', justifyContent: 'flex-end' } },
        h('span.muted.grow', `${this.paper.length} questions · ${this.count('easy')} easy, ${this.count('medium')} medium, ${this.count('hard')} hard`),
        h('button', { onclick: () => this.share() }, 'Share'),
        h('button', { onclick: () => this.saveToBank() }, 'Save to bank'),
        h('button.primary', { onclick: () => this.makeTest() }, 'Make a test'))
    );
  }

  count(level) { return this.paper.filter(q => q.level === level).length; }

  statsLine() {
    const a = this.stats.atoms;
    const parts = [a.definition && `${a.definition} definitions`, a.fact && `${a.fact} facts`, a.list && `${a.list} lists`, a.sequence && `${a.sequence} processes`, a.cause && `${a.cause} cause-and-effect`].filter(Boolean);
    const short = Object.entries(this.stats.shortages || {}).filter(([, n]) => n > 0);
    return `Read ${parts.join(', ')} → ${this.stats.candidates} possible questions.` +
      (short.length ? ` Not enough ${short.map(([l]) => l).join('/')} questions in these notes, so nearby levels filled in.` : '');
  }

  card(q, i) {
    const opts = q.options.map((o, k) => h('li', { class: k === q.answer ? 'right' : '' }, o));
    return h('div.card.q', { class: q.locked ? 'locked' : '' },
      h('div.row', h('b', `${i + 1}.`), h('span.badge', { class: q.level }, q.level), h('span.badge', q.label || q.template), q.topic && h('span.muted', { style: { fontSize: '.8rem' } }, q.topic)),
      h('div.stem', q.stem),
      h('ol', opts),
      q.source && h('div.src', 'From your notes: ', q.source),
      h('div.tools',
        h('button.small', { class: q.locked ? 'primary' : '', onclick: () => { q.locked = !q.locked; this.draw(); } }, q.locked ? '🔒 Locked' : 'Lock'),
        h('button.small', { onclick: () => this.respin(i) }, '↻ Re-spin'),
        h('button.small', { onclick: () => this.edit(i) }, '✎ Edit'),
        h('button.small.danger', { onclick: () => this.reject(i) }, '✕ Reject')));
  }

  body(extra = {}) {
    const s = this.settings;
    return { teachingId: this.t.id, noteIds: s.noteIds.size === this.notes.length ? null : [...s.noteIds], mix: s.mix, templates: [...s.templates], ...extra };
  }

  async spin(btn) {
    const s = this.settings;
    if (!s.noteIds.size) return toast('Choose at least one note', { bad: true });
    if (!s.templates.size) return toast('Choose at least one kind of question', { bad: true });
    if (!(s.mix.easy + s.mix.medium + s.mix.hard)) return toast('Set at least one difficulty above zero', { bad: true });
    const locked = this.paper.filter(q => q.locked);
    const need = Math.max(0, s.count - locked.length);
    btn.classList.add('spinning'); btn.disabled = true;
    try {
      const [r] = await Promise.all([
        need ? api.post('/api/forge/spin', this.body({ count: need, seed: Date.now() % 1e9, avoidAtoms: locked.map(q => q.atomKey) })) : { questions: [], stats: this.stats },
        new Promise(res => setTimeout(res, 650))       // let the wheel turn — it's a spin
      ]);
      this.stats = r.stats;
      this.paper = [...locked, ...r.questions];
      if (r.questions.length < need) toast(`Only ${r.questions.length + locked.length} questions could be made — add more notes for more.`);
    } catch (e) { toast(e.message, { bad: true }); }
    this.draw();
  }

  async respin(i) {
    const q = this.paper[i];
    try {
      const n = await api.post('/api/forge/respin', this.body({ level: q.level, avoidAtoms: this.paper.map(x => x.atomKey) }));
      this.paper[i] = n; this.draw();
    } catch (e) { toast(e.message, { bad: true }); }
  }

  async reject(i) {
    const q = this.paper[i];
    await api.post('/api/forge/reject', { fingerprint: q.fingerprint }).catch(() => {});
    toast('Rejected — the spinner will not offer it again');
    await this.respin(i).catch(() => { this.paper.splice(i, 1); this.draw(); });
  }

  edit(i) {
    const q = this.paper[i];
    modal('Edit question', (close) => {
      const stem = h('textarea', { value: q.stem, style: { minHeight: '90px' } });
      let answer = q.answer;
      const inputs = q.options.map((o) => h('input', { value: o }));
      const radios = inputs.map((_, k) => h('input', { type: 'radio', name: 'ans', checked: k === answer, onchange: () => { answer = k; }, style: { width: '22px', minHeight: 0 } }));
      return h('div.stack',
        field('Question', stem),
        h('label', 'Options (tick the right one)'),
        inputs.map((inp, k) => h('div.row', { style: { flexWrap: 'nowrap' } }, radios[k], inp)),
        h('div.row', { style: { justifyContent: 'flex-end' } }, h('button', { onclick: close }, 'Cancel'), h('button.primary', { onclick: () => {
          Object.assign(q, { stem: stem.value.trim(), options: inputs.map(x => x.value.trim()), answer, edited: true, locked: true });
          close(); this.draw();
        } }, 'Save')));
    });
  }

  async saveToBank() {
    try {
      const saved = await api.post(`/api/teachings/${this.t.id}/bank`, { questions: this.paper });
      this.app.forget();
      toast(`${saved.length} questions saved to the bank`);
      return saved;
    } catch (e) { toast(e.message, { bad: true }); return null; }
  }

  async makeTest() {
    const saved = await this.saveToBank();
    if (saved) createTestDialog(this.app, this.t, saved.map(q => q.id), `${this.t.subject} test`);
  }

  share() {
    new ShareSheet({
      title: `${this.t.class_name} ${this.t.subject} questions`,
      variants: [{ label: 'Question paper', value: 'paper' }, { label: 'Answer key', value: 'key' }, { label: 'Both', value: 'both' }],
      versions: true,
      build: ({ fmt, variant, version }) => api.file('/api/export/questions', { method: 'POST', body: { teachingId: this.t.id, questions: this.paper, fmt, variant, version, title: `${this.t.subject} questions` } })
    }).open();
  }
}
