// Test page + Teacher's Live Watch: open the test, share the link/QR, watch every
// student's progress as it happens, see which questions the class is missing,
// release results, export.
import { h, mount, toast, modal, confirmBox, field } from '../../shared/dom.js';
import { api } from '../../shared/api.js';
import { ShareSheet } from '../../shared/share.js';
import { View } from '../View.js';

const mmss = (ms) => { if (ms <= 0) return '0:00'; const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export class LiveView extends View {
  async render(root) {
    this.root = root;
    this.id = this.params.id;
    const [test, sys] = await Promise.all([api.get(`/api/tests/${this.id}`), api.get('/api/system')]);
    this.test = test;
    this.base = (sys.tunnel && sys.tunnel.url) || location.origin;
    this.app.renderBar([{ label: 'Tests', href: '#/tests' }, { label: test.title }]);
    await this.refresh();
    this.connect();
    this.every(3000, () => this.refresh());       // fallback when the tunnel buffers SSE
    this.every(1000, () => this.tick());
  }

  connect() {
    try {
      this.es = new EventSource(`/api/tests/${this.id}/stream`);
      this.es.onmessage = () => { clearTimeout(this.deb); this.deb = setTimeout(() => this.refresh(), 250); };
    } catch { /* polling covers it */ }
    this.onDestroy = () => { if (this.es) this.es.close(); };
  }

  async refresh() {
    if (this.loading) return;
    this.loading = true;
    try { this.snap = await api.get(`/api/tests/${this.id}/live`); this.draw(); }
    catch (e) { if (e.status === 401) this.app.route(); }
    finally { this.loading = false; }
  }

  tick() {
    for (const el of this.root.querySelectorAll('[data-deadline]')) {
      const left = Number(el.dataset.deadline) - Date.now();
      el.textContent = mmss(left);
      el.classList.toggle('flag', left < 60000);
    }
  }

  link() { return `${this.base}/t/${this.snap.test.code}`; }

  async act(path, msg) {
    try { await api.post(`/api/tests/${this.id}/${path}`); toast(msg); this.test = await api.get(`/api/tests/${this.id}`); await this.refresh(); }
    catch (e) { toast(e.message, { bad: true }); }
  }

  controls() {
    const t = this.snap.test;
    const s = t.state;
    return h('div.card.stack',
      h('div.row.between',
        h('div', h('h1', { style: { margin: 0 } }, this.test.title, ' ', h('span.badge', { class: s }, s)),
          h('p.muted', { style: { margin: 0 } }, `${this.test.teaching.subject} · ${this.test.teaching.class_name} · ${t.total} questions · ${t.config.durationMin} min · results ${t.release_mode === 'on-release' ? 'when I release' : 'straight away'}`)),
        h('div.row',
          s === 'draft' && h('button.primary.big', { onclick: () => this.act('open', 'Test is open — share the link') }, '▶ Open test'),
          s === 'open' && t.release_mode === 'on-release' && h('button.primary', { onclick: async () => { if (await confirmBox('Release results', 'Close the test and show every student their result now?', 'Release')) this.act('release', 'Results released'); } }, 'Release results'),
          s === 'open' && h('button', { onclick: async () => { if (await confirmBox('Close test', 'Stop the test now? Anyone still writing will be submitted as they are.', 'Close test')) this.act('close', 'Test closed'); } }, '■ Close'),
          s === 'closed' && h('button.primary', { onclick: () => this.act('release', 'Results released') }, 'Release results'),
          (s === 'closed' || s === 'released') && h('button', { onclick: () => this.act('reopen', 'Test reopened') }, 'Reopen'))),
      t.code && s === 'open' && h('div.row', { style: { alignItems: 'center', gap: '18px' } },
        h('img', { src: `/api/qr?text=${encodeURIComponent(this.link())}`, alt: 'QR code for the test link', style: { width: '132px', height: '132px', borderRadius: '8px', background: '#fff', cursor: 'zoom-in' }, onclick: () => this.bigQr() }),
        h('div.stack', { style: { flex: '1 1 260px' } },
          h('div', h('span.muted', 'Test code '), h('b', { style: { fontSize: '1.8rem', letterSpacing: '.12em' } }, t.code)),
          h('div', { style: { wordBreak: 'break-all' } }, h('a', { href: this.link(), target: '_blank' }, this.link())),
          h('div.row',
            h('button.primary', { onclick: () => ShareSheet.shareText(this.test.title, `${this.test.title} — open this link on your phone to start the test (code ${t.code}):`, this.link()) }, 'Share link'),
            h('button', { onclick: () => { ShareSheet.copy(this.link()); toast('Link copied'); } }, 'Copy'),
            h('button', { onclick: () => this.bigQr() }, 'Show QR big')))),
      h('div.row',
        h('button.small', { onclick: () => this.sharePaper() }, 'Share paper / answer key'),
        this.snap.students.length > 0 && h('button.small', { onclick: () => this.shareResults() }, 'Share results'),
        this.snap.students.length > 0 && h('a.btn.small', { href: `/api/tests/${this.id}/csv` }, 'Download CSV'),
        s === 'open' && h('button.small', { onclick: () => this.extend() }, '+ Time for everyone'),
        s === 'draft' && h('button.small.ghost.danger', { onclick: async () => { if (await confirmBox('Delete test', 'Delete this test?', 'Delete')) { await api.del(`/api/tests/${this.id}`); this.app.go('#/tests'); } } }, 'Delete'))
    );
  }

  draw() {
    const { summary: sm, students, items, test } = this.snap;
    const scrollY = window.scrollY;
    mount(this.root,
      this.controls(),
      h('div.kpis', { style: { margin: '12px 0' } },
        [['Joined', sm.joined], ['Writing', sm.writing], ['Finished', sm.finished], ['Average', sm.average != null ? sm.average + '%' : '–'], ['Highest', sm.highest != null ? sm.highest + '%' : '–'], ['Lowest', sm.lowest != null ? sm.lowest + '%' : '–']]
          .map(([k, v]) => h('div.kpi', h('div.v', v), h('div.k', k)))),
      h('div.card',
        h('div.row.between', h('h2', { style: { margin: 0 } }, 'Students'), test.state === 'open' && h('span.muted', h('span.pulse'), ' live')),
        !students.length ? h('p.empty', test.state === 'open' ? 'Waiting for students to join…' : 'No one has sat this test yet.') :
          h('div.table-wrap', h('table',
            h('thead', h('tr', ['Name', 'Progress', 'Right so far', 'On', 'Time left', 'Notes', 'Result', ''].map(x => h('th', x)))),
            h('tbody', students.sort((a, b) => (a.finished ? 1 : 0) - (b.finished ? 1 : 0) || a.name.localeCompare(b.name)).map(s => h('tr',
              h('td', h('b', s.name)),
              h('td', h('div.prog', h('i', { style: { width: `${(100 * s.answered) / s.total}%` } })), h('small', `${s.answered}/${s.total}`)),
              h('td', `${s.right}`),
              h('td', s.finished ? '–' : `Q${(s.current || 0) + 1}`),
              h('td', s.finished ? '–' : h('span', { 'data-deadline': s.deadline }, mmss(s.deadline - Date.now()))),
              h('td', s.left > 0 && h('span.flag', `left page ×${s.left}`), !s.finished && s.idle > 90 && h('span.flag', ` idle ${Math.round(s.idle / 60)}m`)),
              h('td', s.finished ? h('b', `${s.pct}%`) : h('span.muted', 'writing')),
              h('td', h('button.small.ghost', { onclick: () => this.studentMenu(s) }, '⋯'))))))) ),
      items.length > 0 && h('div.card',
        h('h2', 'How each question is going'),
        h('p.muted', 'Green = most of the class got it right; red = most got it wrong. Tap a question for details.'),
        h('div.heat', items.map((it, i) => {
          const p = it.answered ? it.p : null;
          // Light tints with dark text read the same in light and dark mode.
          const bg = p == null ? 'var(--line-2)' : `hsl(${Math.round(p * 120)}, 65%, 82%)`;
          return h('div', { style: { background: bg, color: p == null ? 'var(--ink-2)' : '#1b2236', cursor: 'pointer' }, title: it.stem, onclick: () => this.itemDetail(it, i) }, `Q${i + 1}`, h('div', { style: { fontSize: '.7rem', fontWeight: 600 } }, p == null ? '–' : Math.round(p * 100) + '%'));
        })))
    );
    window.scrollTo(0, scrollY);
  }

  itemDetail(it, i) {
    const total = it.choices.reduce((a, b) => a + b, 0) || 1;
    modal(`Question ${i + 1}`, h('div.stack',
      h('p', h('b', it.stem)),
      it.options.map((o, k) => h('div',
        h('div.row.between', h('span', { style: { fontWeight: k === it.answer ? 800 : 400, color: k === it.answer ? 'var(--ok)' : 'inherit' } }, `${'ABCD'[k]}. ${o}`, k === it.answer ? ' ✓' : ''), h('small', `${it.choices[k]}`)),
        h('div.prog', h('i', { style: { width: `${(100 * it.choices[k]) / total}%`, background: k === it.answer ? 'var(--ok)' : 'var(--warn)' } })))),
      it.commonWrong && it.commonWrong.n > 1 && h('p.muted', `${it.commonWrong.n} students chose “${it.options[it.commonWrong.option]}” — worth going over in class.`),
      it.discrimination != null && it.discrimination < 0.1 && it.answered >= 5 && h('p.muted', 'Strong and weak students did about the same on this one — it may be unclear or too easy to guess.')
    ));
  }

  studentMenu(s) {
    modal(s.name, (close) => h('div.sheet-opts',
      h('button', { onclick: () => { close(); this.rename(s); } }, '✎ Change name'),
      !s.finished && h('button', { onclick: async () => { await api.post(`/api/tests/${this.id}/extend`, { minutes: 5, attemptId: s.id }); close(); toast('+5 minutes'); this.refresh(); } }, '+ 5 minutes for this student'),
      h('button.danger', { onclick: async () => { if (await confirmBox('Remove', `Remove ${s.name} from this test?`, 'Remove')) { await api.post(`/api/tests/${this.id}/students/${s.id}/remove`); close(); this.refresh(); } } }, 'Remove from test')));
  }

  rename(s) {
    modal('Change name', (close) => {
      const inp = h('input', { value: s.name });
      return h('form.stack', { onsubmit: async (e) => { e.preventDefault(); await api.post(`/api/tests/${this.id}/students/${s.id}/rename`, { name: inp.value }); close(); this.refresh(); } },
        field('Name', inp), h('div.row', { style: { justifyContent: 'flex-end' } }, h('button.primary', { type: 'submit' }, 'Save')));
    });
  }

  extend() {
    modal('More time for everyone', (close) => {
      const inp = h('input', { type: 'number', value: 5, min: 1, max: 120 });
      return h('form.stack', { onsubmit: async (e) => { e.preventDefault(); await api.post(`/api/tests/${this.id}/extend`, { minutes: Number(inp.value) }); close(); toast('Time added'); this.refresh(); } },
        field('Minutes to add', inp), h('div.row', { style: { justifyContent: 'flex-end' } }, h('button.primary', { type: 'submit' }, 'Add time')));
    });
  }

  bigQr() {
    modal('Scan to join', h('div', { style: { textAlign: 'center' } },
      h('img', { src: `/api/qr?text=${encodeURIComponent(this.link())}`, style: { width: '100%', maxWidth: '420px', background: '#fff', borderRadius: '12px' } }),
      h('p', { style: { fontSize: '1.4rem' } }, 'Code ', h('b', { style: { letterSpacing: '.12em' } }, this.snap.test.code))));
  }

  sharePaper() {
    new ShareSheet({
      title: this.test.title,
      variants: [{ label: 'Question paper', value: 'paper' }, { label: 'Answer key', value: 'key' }, { label: 'Both', value: 'both' }],
      versions: true,
      build: ({ fmt, variant, version }) => api.file(`/api/export/test/${this.id}?fmt=${fmt}&variant=${variant}&version=${version}`),
      linkSpec: { kind: 'test', id: Number(this.id) }
    }).open();
  }

  shareResults() {
    new ShareSheet({
      title: `${this.test.title} results`,
      build: ({ fmt }) => api.file(`/api/export/results/${this.id}?fmt=${fmt}`),
      linkSpec: { kind: 'results', id: Number(this.id) }
    }).open();
  }
}
