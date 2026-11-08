// Home: my classes (subject × class), search, recent tests, the public link.
import { h, mount, toast, modal, field } from '../../shared/dom.js';
import { api } from '../../shared/api.js';
import { View } from '../View.js';

export class HomeView extends View {
  async render(root) {
    this.app.renderBar([{ label: 'My classes' }]);
    const [teachings, tests, sys] = await Promise.all([api.get('/api/teachings'), api.get('/api/tests'), api.get('/api/system')]);
    teachings.forEach(t => this.app.cache.set('t' + t.id, t));
    const results = h('div');
    const search = h('input', { type: 'search', placeholder: 'Search all my notes…', oninput: () => this.search(search.value, results) });
    const open = tests.filter(t => t.state === 'open');

    mount(root,
      h('div.row.between', h('div', h('h1', `Welcome, ${this.app.me.teacher.name.split(' ')[0]}`), h('p.muted', this.app.me.org.name)),
        h('button.primary', { onclick: () => this.addTeaching() }, '+ Add a class')),
      open.length > 0 && h('div.card', { style: { borderColor: 'var(--ok)' } },
        h('div.row.between', h('div', h('span.pulse'), ' ', h('b', `${open.length} test${open.length > 1 ? 's' : ''} running`)),
          open.map(t => h('a.btn.small.primary', { href: `#/tests/${t.id}` }, `Watch ${t.title}`)))),
      h('div', { style: { margin: '14px 0' } }, search, results),
      teachings.length === 0
        ? h('div.card.empty', h('h2', 'Add your first class'), h('p', 'A class is a subject you teach to one group, e.g. Basic Science · JSS2A.'),
            h('button.primary', { onclick: () => this.addTeaching() }, '+ Add a class'))
        : h('div.grid', teachings.map(t => h('div.card.tile', { onclick: () => this.app.go(`#/c/${t.id}`) },
            h('div.subject', t.subject), h('div.klass', t.class_name),
            h('div.stats', h('span', h('b', t.note_count), ' notes'), h('span', h('b', t.question_count), ' questions'), h('span', h('b', t.test_count), ' tests'))))),
      h('div.section', h('h2', 'Public link')),
      this.linkCard(sys)
    );
  }

  linkCard(sys) {
    const t = sys.tunnel || {};
    return h('div.card',
      t.url
        ? h('div.stack', h('div', h('span.pulse'), ' Live at ', h('a', { href: t.url, target: '_blank' }, t.url)),
            h('p.muted', 'Open this on your phone to snap pages; students reach tests at this address too. It changes each time the server restarts.'))
        : h('p.muted', t.status === 'starting' ? 'The public link is starting…' : 'No public link right now. Run start.bat to switch it on. On the same Wi-Fi, use: ' + (sys.lan[0] || sys.local)),
      h('p.muted', { style: { margin: 0, fontSize: '.85rem' } }, 'This computer: ', sys.local));
  }

  async search(q, out) {
    clearTimeout(this.st);
    if (q.trim().length < 2) return mount(out);
    this.st = setTimeout(async () => {
      const rows = await api.get('/api/search?q=' + encodeURIComponent(q));
      mount(out, h('div.card', { style: { marginTop: '8px' } }, rows.length ? h('div.list', rows.map(r =>
        h('a.item.clickable', { href: `#/c/${r.teaching_id}/note/${r.id}` },
          h('div.main', h('div.title', r.title), h('div.sub', `${r.subject} · ${r.class_name} — ${r.preview.replace(/\s+/g, ' ')}`))))) : h('p.muted', 'No notes match.')));
    }, 250);
  }

  async addTeaching() {
    const opts = await api.get('/api/options');
    modal('Add a class', (close) => {
      const subject = h('input', { list: 'subjects', placeholder: 'e.g. Basic Science', required: true });
      const klass = h('input', { list: 'classes', placeholder: 'e.g. JSS2A', required: true });
      return h('form.stack', { onsubmit: async (e) => {
        e.preventDefault();
        try {
          const t = await api.post('/api/teachings', { subject: subject.value, className: klass.value });
          this.app.forget(); close(); this.app.go(`#/c/${t.id}`);
        } catch (err) { toast(err.message, { bad: true }); }
      } },
        field('Subject', subject), h('datalist#subjects', opts.subjects.map(s => h('option', { value: s }))),
        field('Class', klass), h('datalist#classes', opts.classes.map(s => h('option', { value: s }))),
        h('div.row', { style: { justifyContent: 'flex-end' } }, h('button', { type: 'button', onclick: close }, 'Cancel'), h('button.primary', { type: 'submit' }, 'Add')));
    });
  }
}
