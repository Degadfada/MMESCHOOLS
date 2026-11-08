// The question bank for one class: reuse, edit, pick for a new test, share.
import { h, mount, toast, confirmBox } from '../../shared/dom.js';
import { api } from '../../shared/api.js';
import { ShareSheet } from '../../shared/share.js';
import { View } from '../View.js';
import { createTestDialog } from './tests.js';

export class BankView extends View {
  async render(root) {
    const t = await this.app.teaching(this.params.tid);
    this.t = t; this.root = root;
    this.app.renderBar([{ label: 'My classes', href: '#/' }, { label: `${t.subject} · ${t.class_name}`, href: `#/c/${t.id}` }, { label: 'Question bank' }]);
    this.qs = await api.get(`/api/teachings/${t.id}/bank`);
    this.sel = this.sel || new Set();
    this.filter = this.filter || 'all';
    this.draw();
  }

  draw() {
    const shown = this.qs.filter(q => this.filter === 'all' || q.level === this.filter);
    mount(this.root,
      h('div.row.between', h('h1', 'Question bank'), h('a.btn.primary', { href: `#/c/${this.t.id}/forge` }, '🎡 Spin more')),
      !this.qs.length ? h('div.card.empty', h('p', 'No saved questions yet. Spin some from your notes and save them.')) : [
        h('div.row', { style: { margin: '8px 0' } },
          ['all', 'easy', 'medium', 'hard'].map(f => h('button.small', { class: this.filter === f ? 'primary' : '', onclick: () => { this.filter = f; this.draw(); } }, f)),
          h('span.spacer'),
          h('button.small', { onclick: () => { shown.forEach(q => this.sel.add(q.id)); this.draw(); } }, 'Select all'),
          this.sel.size > 0 && h('button.small', { onclick: () => { this.sel.clear(); this.draw(); } }, 'Clear')),
        h('div.stack', shown.map(q => h('div.card.q', { class: this.sel.has(q.id) ? 'locked' : '' },
          h('div.row', h('input', { type: 'checkbox', checked: this.sel.has(q.id), style: { width: '20px', minHeight: 0 }, onchange: (e) => { e.target.checked ? this.sel.add(q.id) : this.sel.delete(q.id); this.draw(); } }),
            h('span.badge', { class: q.level }, q.level),
            q.sittings > 0 && h('span.muted', { style: { fontSize: '.8rem' } }, `sat by ${q.sittings} · measured ${q.observed}/5`),
            h('span.spacer'),
            h('button.small.ghost.danger', { onclick: async () => { if (await confirmBox('Remove', 'Remove this question from the bank?', 'Remove')) { await api.del(`/api/bank/${q.id}`); this.qs = this.qs.filter(x => x.id !== q.id); this.sel.delete(q.id); this.draw(); } } }, 'Remove')),
          h('div.stem', q.stem), h('ol', q.options.map((o, k) => h('li', { class: k === q.answer ? 'right' : '' }, o))),
          q.source && h('div.src', 'From your notes: ', q.source)))),
        this.sel.size > 0 && h('div.card.row', { style: { position: 'sticky', bottom: '8px', marginTop: '12px', justifyContent: 'flex-end' } },
          h('span.muted.grow', `${this.sel.size} selected`),
          h('button', { onclick: () => this.share() }, 'Share'),
          h('button.primary', { onclick: () => createTestDialog(this.app, this.t, [...this.sel], `${this.t.subject} test`) }, 'Make a test'))
      ]);
  }

  share() {
    const ids = [...this.sel];
    new ShareSheet({
      title: `${this.t.class_name} ${this.t.subject} questions`,
      variants: [{ label: 'Question paper', value: 'paper' }, { label: 'Answer key', value: 'key' }, { label: 'Both', value: 'both' }],
      versions: true,
      build: ({ fmt, variant, version }) => api.file('/api/export/questions', { method: 'POST', body: { teachingId: this.t.id, ids, fmt, variant, version } })
    }).open();
    void toast;
  }
}
