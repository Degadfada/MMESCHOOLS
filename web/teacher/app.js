// web/teacher/app.js — the teacher's app: session, top bar, hash router.
import { h, mount, toast } from '../shared/dom.js';
import { api } from '../shared/api.js';
import { AuthView } from './views/auth.js';
import { HomeView } from './views/home.js';
import { NotebookView } from './views/notebook.js';
import { NoteView } from './views/note.js';
import { SnapView } from './views/snap.js';
import { ForgeView } from './views/forge.js';
import { BankView } from './views/bank.js';
import { TestsView } from './views/tests.js';
import { LiveView } from './views/live.js';
import { HandwritingView } from './views/handwriting.js';
import { TeamView } from './views/team.js';

const ROUTES = [
  [/^#?\/?$/, HomeView],
  [/^#\/c\/(\d+)$/, NotebookView, ['tid']],
  [/^#\/c\/(\d+)\/note\/(new|\d+)$/, NoteView, ['tid', 'nid']],
  [/^#\/c\/(\d+)\/snap$/, SnapView, ['tid']],
  [/^#\/c\/(\d+)\/forge$/, ForgeView, ['tid']],
  [/^#\/c\/(\d+)\/bank$/, BankView, ['tid']],
  [/^#\/tests$/, TestsView],
  [/^#\/tests\/(\d+)$/, LiveView, ['id']],
  [/^#\/handwriting$/, HandwritingView],
  [/^#\/team$/, TeamView]
];

export class TeacherApp {
  constructor() {
    this.bar = document.getElementById('bar');
    this.root = document.getElementById('view');
    this.me = null;
    this.view = null;
    this.cache = new Map();
    window.addEventListener('hashchange', () => this.route());
  }

  async start() {
    // "/live/12" links land here: send them to the hash route.
    const m = location.pathname.match(/^\/live\/(\d+)/);
    if (m) history.replaceState(null, '', '/#/tests/' + m[1]);
    try { this.me = await api.get('/api/me'); }
    catch { this.me = null; }
    this.route();
  }

  go(hash) { if (location.hash === hash) this.route(); else location.hash = hash; }

  async teaching(id) {
    const key = 't' + id;
    if (!this.cache.has(key)) {
      const list = await api.get('/api/teachings');
      for (const t of list) this.cache.set('t' + t.id, t);
    }
    return this.cache.get(key);
  }
  forget() { this.cache.clear(); }

  renderBar(crumbs = []) {
    if (!this.me) return mount(this.bar);
    mount(this.bar, h('div.bar', h('div.wrap',
      h('a.brand', { href: '#/' }, h('span.dot', 'M'), h('span.hide-sm', 'MMESCHOOLS')),
      h('div.crumbs.grow', crumbs.map((c, i) => [i ? ' › ' : '', c.href ? h('a', { href: c.href }, c.label) : c.label])),
      h('a.btn.small.ghost', { href: '#/tests' }, 'Tests'),
      h('a.btn.small.ghost.hide-sm', { href: '#/handwriting' }, 'Handwriting'),
      h('a.btn.small.ghost', { href: '#/team', title: 'Team & settings' }, '☰')
    )));
  }

  async route() {
    if (this.view && this.view.destroy) this.view.destroy();
    this.view = null;
    document.querySelectorAll('.modal-back').forEach(m => m.remove());   // dialogs belong to the screen that opened them
    window.scrollTo(0, 0);
    if (!this.me) {
      this.renderBar();
      this.view = new AuthView(this);
      return this.view.render(this.root);
    }
    const hash = location.hash || '#/';
    for (const [re, View, keys = []] of ROUTES) {
      const m = hash.match(re);
      if (!m) continue;
      const params = Object.fromEntries(keys.map((k, i) => [k, m[i + 1]]));
      this.view = new View(this, params);
      try { await this.view.render(this.root); }
      catch (e) {
        if (e.status === 401) { this.me = null; return this.route(); }
        mount(this.root, h('div.card.empty', h('p', e.message), h('a.btn', { href: '#/' }, 'Home')));
      }
      return;
    }
    this.go('#/');
  }

  async signedIn() { this.me = await api.get('/api/me'); this.forget(); this.go('#/'); }
  async signOut() { await api.post('/api/auth/logout'); this.me = null; this.forget(); location.hash = '#/'; this.route(); toast('Signed out'); }
}

const app = new TeacherApp();
window.mme = app;
app.start();
