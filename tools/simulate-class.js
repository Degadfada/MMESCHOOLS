// tools/simulate-class.js — a pretend class of students sitting a test.
//
//   node tools/simulate-class.js --code 7KQ2MX [--url https://xxx.trycloudflare.com] [--students 30]
//        Joins an OPEN test as N students who answer at human-ish speed (some fast, some
//        slow, a few refresh their page, one types a name already taken). Watch it on
//        the teacher's Live Watch page.
//
//   node tools/simulate-class.js --selftest
//        Starts a private in-memory server, makes a teacher, notes, a test, runs the class,
//        releases results and checks every number adds up. Exits non-zero on any mismatch.
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true) : d; };

const FIRST = ['Aniekan', 'Ekaette', 'Uduak', 'Idara', 'Emem', 'Ime', 'Nsikak', 'Mfon', 'Ubong', 'Itoro', 'Chidi', 'Ngozi', 'Tunde', 'Aisha', 'Kemi', 'Bassey', 'Effiong', 'Ofonime', 'Inyang', 'Edidiong'];
const LAST = ['Bassey', 'Okon', 'Udo', 'Etim', 'Akpan', 'Essien', 'Inyang', 'Ekpo', 'Umoh', 'Edet'];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

class Student {
  constructor(base, code, name, { skill, speedMs }) {
    Object.assign(this, { base, code, name, skill, speedMs });
    this.cookie = 'mme_dev=' + Math.random().toString(36).slice(2).padEnd(24, 'x');
  }
  async call(method, path, body) {
    const r = await fetch(this.base + path, { method, headers: { 'Content-Type': 'application/json', cookie: this.cookie }, body: body ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(data.error || r.status); e.status = r.status; throw e; }
    return data;
  }
  async sit({ refresh = false } = {}) {
    try { await this.call('POST', `/api/t/${this.code}/join`, { name: this.name }); }
    catch (e) { if (e.status === 409 && /already joined/.test(e.message)) { this.name += ' ' + LAST[Math.floor(Math.random() * LAST.length)][0] + '.'; await this.call('POST', `/api/t/${this.code}/join`, { name: this.name }); this.renamed = true; } else throw e; }
    let paper = await this.call('GET', `/api/t/${this.code}/paper`);
    for (let i = 0; i < paper.questions.length; i++) {
      if (refresh && i === Math.floor(paper.questions.length / 2)) paper = await this.call('GET', `/api/t/${this.code}/paper`);   // came back after the phone slept
      const q = paper.questions[i];
      await sleep(this.speedMs * (0.5 + Math.random()));
      // Students don't know the key; "skill" is how often they pick the option the class favours.
      const choice = Math.random() < this.skill ? 0 : Math.floor(Math.random() * q.options.length);
      await this.call('POST', `/api/t/${this.code}/view`, { n: i });
      await this.call('POST', `/api/t/${this.code}/answer`, { qid: q.qid, choice });
      if (Math.random() < 0.05) await this.call('POST', `/api/t/${this.code}/view`, { hidden: true, n: i });
    }
    return this.call('POST', `/api/t/${this.code}/finish`);
  }
}

async function runClass(base, code, n, speed = 400) {
  const names = Array.from({ length: n }, (_, i) => `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`);
  names[n - 1] = names[0];                                  // one student types a name that is taken
  const students = names.map(nm => new Student(base, code, nm, { skill: 0.2 + Math.random() * 0.7, speedMs: speed * (0.5 + Math.random()) }));
  const t0 = Date.now();
  const results = await Promise.allSettled(students.map((s, i) => sleep(i * 60).then(() => s.sit({ refresh: i % 7 === 3 }))));
  const failed = results.filter(r => r.status === 'rejected');
  console.log(`${n} students finished in ${((Date.now() - t0) / 1000).toFixed(1)}s; ${failed.length} failed${failed.length ? ': ' + failed.map(f => f.reason.message).join('; ') : ''}`);
  console.log(`renamed after a duplicate name: ${students.filter(s => s.renamed).map(s => s.name).join(', ') || 'none'}`);
  return { students, failed };
}

if (arg('selftest', false)) {
  process.removeAllListeners('warning');
  const { App } = await import('../mme/App.js');
  const { BASIC_SCIENCE } = await import('../tests/fixtures/notes.js');
  const app = await new App({ port: 5099, dbFile: ':memory:', log: { log() {}, error: console.error } }).start();
  const base = 'http://localhost:5099';
  let cookie = '';
  const t = async (method, path, body) => {
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const ty = r.headers.get('content-type') || '';
    return ty.includes('json') ? r.json() : r.text();
  };
  await t('POST', '/api/auth/signup', { name: 'Mmenyene', email: 'm@x.ng', password: 'secret12' });
  const T = await t('POST', '/api/teachings', { subject: 'Basic Science', className: 'JSS2A' });
  for (const n of BASIC_SCIENCE) await t('POST', '/api/notes', { teachingId: T.id, ...n });
  const spin = await t('POST', '/api/forge/spin', { teachingId: T.id, count: 15, seed: 1 });
  const bank = await t('POST', `/api/teachings/${T.id}/bank`, { questions: spin.questions });
  const test = await t('POST', '/api/tests', { teachingId: T.id, title: 'Sim', questionIds: bank.map(q => q.id), releaseMode: 'on-release', config: { durationMin: 20 } });
  const open = await t('POST', `/api/tests/${test.id}/open`);
  const N = Number(arg('students', 30));
  const { failed } = await runClass(base, open.code, N, 40);
  const live = await t('GET', `/api/tests/${test.id}/live`);
  const checks = [
    ['joined', live.summary.joined, N],
    ['finished', live.summary.finished, N],
    ['every answer recorded', live.students.reduce((a, s) => a + s.answered, 0), N * 15],
    ['item answer counts', live.items.reduce((a, it) => a + it.answered, 0), N * 15],
    ['no failures', failed.length, 0]
  ];
  await t('POST', `/api/tests/${test.id}/release`);
  const csv = await t('GET', `/api/tests/${test.id}/csv`);
  checks.push(['csv rows', csv.trim().split('\n').length - 1, N]);
  const scoreSum = live.students.reduce((a, s) => a + s.score, 0), csvSum = csv.trim().split('\n').slice(1).reduce((a, l) => a + Number(l.split(',')[1]), 0);
  checks.push(['csv scores match live scores', csvSum, scoreSum]);
  const bankAfter = await t('GET', `/api/teachings/${T.id}/bank`);
  checks.push(['bank difficulty measured from this sitting', bankAfter.filter(q => q.sittings > 0).length, 15]);
  let bad = 0;
  for (const [name, got, want] of checks) { const ok = got === want; if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${name}: ${got}${ok ? '' : ' (expected ' + want + ')'}`); }
  console.log(`class average ${live.summary.average}% (highest ${live.summary.highest}%, lowest ${live.summary.lowest}%)`);
  await app.stop();
  process.exit(bad ? 1 : 0);
} else {
  const code = arg('code');
  if (!code) { console.log('Usage: node tools/simulate-class.js --code TESTCODE [--url URL] [--students 30]   |   --selftest'); process.exit(1); }
  await runClass(String(arg('url', 'http://localhost:5080')).replace(/\/$/, ''), String(code).toUpperCase(), Number(arg('students', 30)), Number(arg('speed', 2500)));
}
