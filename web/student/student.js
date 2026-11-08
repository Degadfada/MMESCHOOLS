// web/student/student.js — what a student sees: type your name, answer one question per
// screen (every tap is saved straight away), submit, then see your result — at once,
// or when the teacher releases results.
import { h, mount, toast, confirmBox } from '../shared/dom.js';
import { api } from '../shared/api.js';

const LETTERS = 'ABCDEFGH';
const mmss = (ms) => { if (ms <= 0) return '0:00'; const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

class StudentApp {
  constructor() {
    this.root = document.getElementById('view');
    this.code = (location.pathname.split('/t/')[1] || '').split(/[/?#]/)[0].toUpperCase();
    this.skew = 0;            // server clock − device clock
  }

  async start() {
    if (!this.code) return this.askCode();
    try { this.info = await api.get(`/api/t/${this.code}`); }
    catch (e) { return this.askCode(e.message); }
    document.title = `${this.info.title} · Test`;
    const me = this.info.me;
    if (!me) return this.join();
    if (me.finished) return this.result();
    this.sit();
  }

  askCode(err) {
    const inp = h('input', { placeholder: 'e.g. 7KQ2MX', maxLength: 8, style: { textTransform: 'uppercase', fontSize: '1.4rem', letterSpacing: '.15em', textAlign: 'center' } });
    mount(this.root, h('div.card.stack', { style: { marginTop: '10vh', textAlign: 'center' } },
      h('h1', 'Enter your test code'), err && h('p.danger', err), inp,
      h('button.primary.big', { onclick: () => { location.href = '/t/' + inp.value.trim().toUpperCase(); } }, 'Continue')));
  }

  join() {
    const i = this.info;
    const name = h('input', { placeholder: 'Your full name', autocomplete: 'name', maxLength: 60 });
    const go = async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      try { await api.post(`/api/t/${this.code}/join`, { name: name.value }); this.sit(); }
      catch (err) { toast(err.message, { bad: true }); btn.disabled = false; }
    };
    mount(this.root,
      h('div.card.stack', { style: { marginTop: '4vh' } },
        h('div', h('div.badge', i.subject), ' ', h('span.muted', `${i.className} · ${i.teacher}`)),
        h('h1', i.title),
        h('p', `${i.questions} questions · ${i.durationMin} minutes`),
        i.instructions && h('p.muted', i.instructions),
        i.state !== 'open'
          ? h('p.danger', i.state === 'draft' ? 'This test is not open yet. Wait for your teacher.' : 'This test has closed.')
          : h('form.stack', { onsubmit: go }, name,
              h('button.primary.big', { type: 'submit', style: { width: '100%', justifyContent: 'center' } }, 'Start the test'),
              h('p.muted', { style: { fontSize: '.85rem' } }, 'Your answers save as you go. If your phone goes off, open this link again on the same phone to continue.'))));
    if (i.state === 'open') name.focus();
  }

  async sit() {
    let p;
    try { p = await api.get(`/api/t/${this.code}/paper`); }
    catch (e) { return mount(this.root, h('div.card', h('p', e.message))); }
    if (p.finished) return this.result();
    this.skew = p.now - Date.now();
    this.paper = p;
    this.answers = p.answers || {};
    this.idx = Math.min(p.current || 0, p.questions.length - 1);
    document.addEventListener('visibilitychange', this.vis = () => {
      api.post(`/api/t/${this.code}/view`, { hidden: document.hidden, n: this.idx }).catch(() => {});
    });
    clearInterval(this.clock);
    this.clock = setInterval(() => this.tick(), 500);
    this.draw();
  }

  left() { return this.paper.deadline - (Date.now() + this.skew); }

  tick() {
    const t = document.getElementById('timer');
    if (!t) return;
    const left = this.left();
    t.textContent = mmss(left);
    t.classList.toggle('low', left < 60000);
    if (left <= 0 && !this.ending) { this.ending = true; toast('Time is up — submitting your answers'); this.finish(true); }
  }

  draw() {
    const qs = this.paper.questions, q = qs[this.idx];
    const done = Object.keys(this.answers).length;
    mount(this.root,
      h('div.row.between', { style: { margin: '6px 0 10px' } },
        h('span.muted', `Question ${this.idx + 1} of ${qs.length}`),
        h('span', '⏱ ', h('span.timer#timer', mmss(this.left())))),
      h('div.prog', { style: { marginBottom: '14px' } }, h('i', { style: { width: `${(100 * done) / qs.length}%` } })),
      h('div.card',
        h('h2', { style: { fontWeight: 600, lineHeight: 1.4 } }, q.stem),
        q.options.map((o, k) => h('button.opt', { class: this.answers[q.qid] === k ? 'chosen' : '', onclick: () => this.choose(q, k) }, h('span.l', LETTERS[k]), h('span', o)))),
      h('div.row.between', { style: { marginTop: '12px' } },
        h('button', { disabled: this.idx === 0, onclick: () => this.goTo(this.idx - 1) }, '← Back'),
        this.idx < qs.length - 1 ? h('button.primary', { onclick: () => this.goTo(this.idx + 1) }, 'Next →')
          : h('button.primary', { onclick: () => this.finish(false) }, 'Submit')),
      h('div.card', { style: { marginTop: '14px' } },
        h('div.row.between', h('b', 'All questions'), h('span.muted', `${done} answered`)),
        h('div.dots', { style: { marginTop: '8px' } }, qs.map((x, k) => h('button', { class: [this.answers[x.qid] != null ? 'done' : '', k === this.idx ? 'here' : ''].join(' '), onclick: () => this.goTo(k) }, String(k + 1)))),
        h('button', { style: { width: '100%', marginTop: '12px', justifyContent: 'center' }, onclick: () => this.finish(false) }, 'Submit my answers')));
  }

  goTo(k) {
    this.idx = k;
    api.post(`/api/t/${this.code}/view`, { n: k }).catch(() => {});
    this.draw();
    window.scrollTo(0, 0);
  }

  async choose(q, k) {
    const prev = this.answers[q.qid];
    this.answers[q.qid] = k;
    this.draw();
    try { await api.post(`/api/t/${this.code}/answer`, { qid: q.qid, choice: k }); }
    catch (e) {
      if (e.status === 409) return this.result();
      this.answers[q.qid] = prev; this.draw();
      toast(e.status === 0 ? 'Not saved — no connection. Tap your answer again.' : e.message, { bad: true });
      return;
    }
    // Move on by itself after a short pause, so the student sees their choice.
    if (this.idx < this.paper.questions.length - 1 && prev == null) setTimeout(() => { if (this.paper.questions[this.idx] === q) this.goTo(this.idx + 1); }, 350);
  }

  async finish(auto) {
    const missing = this.paper.questions.length - Object.keys(this.answers).length;
    if (!auto && !(await confirmBox('Submit?', missing ? `You have ${missing} unanswered question${missing > 1 ? 's' : ''}. Submit anyway?` : 'Submit your answers now? You cannot change them after.', 'Submit'))) return;
    clearInterval(this.clock);
    document.removeEventListener('visibilitychange', this.vis);
    try { await api.post(`/api/t/${this.code}/finish`); } catch { /* the result call below explains */ }
    this.result();
  }

  async result() {
    clearInterval(this.clock);
    let r;
    try { r = await api.get(`/api/t/${this.code}/result`); }
    catch (e) { return mount(this.root, h('div.card', h('p', e.message))); }
    if (!r.resultVisible) {
      mount(this.root, h('div.card.stack', { style: { textAlign: 'center', marginTop: '8vh' } },
        h('div', { style: { fontSize: '3rem' } }, '✅'), h('h1', 'Answers submitted'),
        h('p', r.waitingMessage || 'Your result will appear here.'), h('p.muted', h('span.pulse'), ' Waiting for your teacher…')));
      clearTimeout(this.wait);
      this.wait = setTimeout(() => this.result(), 4000);
      return;
    }
    const colour = r.pct >= 50 ? 'var(--ok)' : r.pct >= 40 ? 'var(--warn)' : 'var(--bad)';
    mount(this.root,
      h('div.card', { style: { textAlign: 'center' } },
        h('p.muted', this.info ? this.info.title : ''), h('h2', r.name),
        h('div.score-ring', { style: { background: `conic-gradient(${colour} ${r.pct * 3.6}deg, var(--line-2) 0)` } },
          h('div', { style: { background: 'var(--card)', width: '112px', height: '112px', borderRadius: '50%', display: 'grid', placeItems: 'center' } }, `${r.pct}%`)),
        h('h2', `${r.score} out of ${r.max}`), h('p', { style: { color: colour, fontWeight: 700 } }, r.band)),
      r.review && h('div.review', r.review.map(q => h('div.card', { style: { marginTop: '10px' } },
        h('p', h('b', `${q.n}. `), q.stem),
        q.options.map((o, k) => h('div.opt.btn', { class: k === q.answer ? 'right' : k === q.chosen ? 'wrong' : '' }, h('span.l', LETTERS[k]), h('span', o, k === q.answer ? '  ✓' : k === q.chosen ? '  (your answer)' : ''))),
        q.chosen == null && h('p.muted', 'Not answered'),
        q.source && !q.correct && h('p.muted', { style: { fontSize: '.85rem', borderLeft: '3px solid var(--line)', paddingLeft: '8px' } }, 'From your notes: ', q.source)))));
  }
}

new StudentApp().start();
