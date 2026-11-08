// All my tests, and the "make a test" dialog used from the Spin screen and the bank.
import { h, mount, toast, modal, field, fmtDate } from '../../shared/dom.js';
import { api } from '../../shared/api.js';
import { View } from '../View.js';

export function createTestDialog(app, teaching, questionIds, defaultTitle) {
  modal('Make a test', (close) => {
    const title = h('input', { value: defaultTitle, required: true });
    const minutes = h('input', { type: 'number', min: 1, max: 300, value: Math.max(5, Math.round(questionIds.length * 1.5)) });
    const release = h('select', h('option', { value: 'instant' }, 'Each student sees their score when they submit'), h('option', { value: 'on-release' }, 'Everyone sees results when I press Release'));
    const shuffle = h('input', { type: 'checkbox', checked: true });
    const corrections = h('input', { type: 'checkbox', checked: true });
    const instructions = h('input', { value: 'Answer all questions. Choose the best option for each.' });
    return h('form.stack', { onsubmit: async (e) => {
      e.preventDefault();
      try {
        const t = await api.post('/api/tests', {
          teachingId: teaching.id, title: title.value, questionIds, releaseMode: release.value,
          config: { durationMin: Number(minutes.value), shuffleQuestions: shuffle.checked, shuffleOptions: shuffle.checked, showCorrections: corrections.checked, instructions: instructions.value }
        });
        close(); app.forget(); app.go(`#/tests/${t.id}`);
      } catch (err) { toast(err.message, { bad: true }); }
    } },
      h('p.muted', `${questionIds.length} questions · ${teaching.subject} · ${teaching.class_name}`),
      field('Title', title), field('Time allowed (minutes)', minutes), field('Results', release), field('Instructions', instructions),
      h('label.check', shuffle, 'Shuffle questions and options for each student'),
      h('label.check', corrections, 'Show students the right answers with their result'),
      h('div.row', { style: { justifyContent: 'flex-end' } }, h('button', { type: 'button', onclick: close }, 'Cancel'), h('button.primary', { type: 'submit' }, 'Create test')));
  });
}

export class TestsView extends View {
  async render(root) {
    this.app.renderBar([{ label: 'My classes', href: '#/' }, { label: 'Tests' }]);
    const tests = await api.get('/api/tests');
    mount(root,
      h('h1', 'Tests'),
      !tests.length ? h('div.card.empty', h('p', 'No tests yet. Open a class, spin questions, then “Make a test”.'), h('a.btn', { href: '#/' }, 'My classes'))
        : h('div.card', h('div.list', tests.map(t => h('a.item.clickable', { href: `#/tests/${t.id}` },
          h('div.main', h('div.title', t.title, ' ', h('span.badge', { class: t.state }, t.state)),
            h('div.sub', `${t.subject} · ${t.class_name} · ${t.students} students${t.avg_pct != null ? ` · average ${t.avg_pct}%` : ''} · ${fmtDate(t.opened_at || t.created)}`)),
          t.code && h('code', t.code)))))
    );
  }
}
