// The teacher's personal handwriting model: how much it has learned, and re-training.
import { h, mount, toast, fmtDate } from '../../shared/dom.js';
import { api } from '../../shared/api.js';
import { View } from '../View.js';

export class HandwritingView extends View {
  async render(root) {
    this.root = root;
    this.app.renderBar([{ label: 'My classes', href: '#/' }, { label: 'My handwriting' }]);
    await this.draw();
  }

  async draw() {
    const m = await api.get('/api/ocr/info');
    const job = m.job;
    const running = job && job.state === 'running';
    const enough = m.samples >= m.minToTrain;
    mount(this.root,
      h('h1', 'My handwriting'),
      h('p.muted', 'Every word you fix after snapping a page teaches the reader your letters. Re-train now and then; the new model is only switched on if it reads your writing better than the old one.'),
      h('div.kpis', { style: { margin: '12px 0' } },
        h('div.kpi', h('div.v', m.samples), h('div.k', 'letters learned')),
        h('div.kpi', h('div.v', m.personal ? `v${m.personal.version}` : 'starter'), h('div.k', 'model in use')),
        h('div.kpi', h('div.v', m.personal && m.personal.accuracy != null ? m.personal.accuracy + '%' : '–'), h('div.k', 'on your letters'))),
      h('div.card.stack',
        running ? h('div', h('p', 'Training your model…'), h('div.prog', h('i', { style: { width: `${Math.round(100 * job.progress)}%` } })), h('p.muted', 'You can keep working; this runs in the background on the computer.'))
          : h('div.row',
            h('button.primary', { disabled: !enough, onclick: async () => { try { await api.post('/api/ocr/train'); toast('Training started'); this.draw(); } catch (e) { toast(e.message, { bad: true }); } } }, 'Re-train my model'),
            !enough && h('span.muted', `Fix at least ${m.minToTrain} letters first (${m.samples} so far).`)),
        job && job.state === 'done' && h('p', job.promoted
          ? `Done — the new model is in use${job.accAfter != null ? ` (${Math.round(job.accAfter * 100)}% on letters it had not seen${job.accBefore != null ? `, up from ${Math.round(job.accBefore * 100)}%` : ''})` : ''}.`
          : `Done — the new model was not better (${Math.round((job.accAfter || 0) * 100)}% vs ${Math.round((job.accBefore || 0) * 100)}%), so the old one stays. Snap and correct a few more pages.`),
        job && job.state === 'failed' && h('p.danger', 'Training failed: ' + job.error)),
      m.history.length > 0 && h('div.card', h('h2', 'History'), h('div.list', m.history.slice().reverse().map(v => h('div.item',
        h('div.main', h('div.title', `Version ${v.version}`, v.active ? h('span.badge.open', { style: { marginLeft: '6px' } }, 'in use') : null),
          h('div.sub', `${fmtDate(v.created)} · ${v.samples} letters · ${v.accuracy != null ? v.accuracy + '% on held-back letters' : ''}`)))))),
      h('div.card', h('h3', 'Tips for clean snaps'), h('ul',
        h('li', 'Good light, no shadow of the phone across the page.'),
        h('li', 'The whole page in the frame; drag the corner dots if they miss.'),
        h('li', 'Dark pen reads better than pencil.'),
        h('li', 'Fix the orange words first — those are the ones the reader was unsure of.')))
    );
    if (running) setTimeout(() => { if (this.app.view === this) this.draw(); }, 2500);
  }
}
