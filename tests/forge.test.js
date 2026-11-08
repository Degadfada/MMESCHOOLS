import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QuestionForge } from '../mmenyene/forge/QuestionForge.js';
import { Comprehender } from '../mmenyene/forge/Comprehender.js';
import { DifficultyModel } from '../mmenyene/forge/DifficultyModel.js';
import { Text } from '../mme/text/Text.js';
import { BASIC_SCIENCE, SOCIAL_STUDIES } from './fixtures/notes.js';

test('comprehender reads definitions, lists, steps and causes from school notes', () => {
  const c = new Comprehender().read(BASIC_SCIENCE);
  const terms = c.of('definition').map(d => d.term);
  for (const t of ['Respiration', 'Photosynthesis', 'Skull', 'Melting', 'Irritability']) assert.ok(terms.includes(t), `missing ${t}`);
  assert.ok(!terms.some(t => /states of matter/i.test(t)), 'a list sentence was taken as a definition');
  assert.ok(c.of('list').some(l => /characteristics of living things/i.test(l.label) && l.items.length === 7));
  assert.ok(c.of('sequence').some(s => /blood clotting/i.test(s.label) && s.steps.length === 4));
  assert.ok(c.of('cause').some(x => /calcium/i.test(x.cause)));
});

test('"… is called X" definitions are understood', () => {
  const p = new Comprehender().read(BASIC_SCIENCE).of('definition').find(d => d.term === 'Photosynthesis');
  assert.match(p.def, /process by which green plants make their own food/i);
});

test('every question has exactly four distinct options and one right answer', () => {
  for (const notes of [BASIC_SCIENCE, SOCIAL_STUDIES]) {
    const { candidates } = new QuestionForge().candidates(notes, { seed: 3 });
    assert.ok(candidates.length > 20);
    for (const q of candidates) {
      assert.equal(q.options.length, 4, q.stem);
      assert.equal(new Set(q.options.map(Text.norm)).size, 4, 'duplicate options: ' + q.options.join(' | '));
      assert.ok(q.answer >= 0 && q.answer < 4);
      assert.ok(q.difficulty >= 1 && q.difficulty <= 5);
    }
  }
});

test('the answer never appears in a fill-the-gap stem', () => {
  const { candidates } = new QuestionForge().candidates(BASIC_SCIENCE, { seed: 5, templates: ['cloze', 'number'] });
  for (const q of candidates) assert.ok(!q.stem.toLowerCase().includes(` ${q.options[q.answer].toLowerCase()} `), q.stem);
});

test('spin honours count, difficulty mix and uses each piece of knowledge once', () => {
  const r = new QuestionForge().spin(BASIC_SCIENCE, { count: 12, mix: { easy: 1, medium: 1, hard: 1 }, seed: 9 });
  assert.equal(r.questions.length, 12);
  assert.equal(new Set(r.questions.map(q => q.atomKey)).size, 12);
  assert.ok(r.stats.got.easy >= 3 && r.stats.got.hard >= 3, JSON.stringify(r.stats.got));
  const hard = new QuestionForge().spin(BASIC_SCIENCE, { count: 6, mix: { easy: 0, medium: 0, hard: 1 }, seed: 9 });
  assert.ok(hard.questions.every(q => q.level === 'hard'));
});

test('same seed, same paper; new seed, different paper', () => {
  const f = new QuestionForge();
  const a = f.spin(BASIC_SCIENCE, { count: 8, seed: 1 }).questions.map(q => q.stem);
  const b = f.spin(BASIC_SCIENCE, { count: 8, seed: 1 }).questions.map(q => q.stem);
  const c = f.spin(BASIC_SCIENCE, { count: 8, seed: 2 }).questions.map(q => q.stem);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test('rejected questions are not offered again', () => {
  const f = new QuestionForge();
  const first = f.spin(BASIC_SCIENCE, { count: 5, seed: 4 });
  const exclude = new Set(first.questions.map(q => q.fingerprint));
  const again = f.spin(BASIC_SCIENCE, { count: 5, seed: 4, exclude });
  assert.ok(again.questions.every(q => !exclude.has(q.fingerprint)));
});

test('difficulty model orders items sensibly and blends observations', () => {
  const m = new DifficultyModel();
  const easy = m.predict({ bloom: 'remember', closeness: 0.05, sameTopic: 0, lenSpread: 0.5 });
  const hard = m.predict({ bloom: 'analyse', closeness: 0.5, sameTopic: 1, lenSpread: 0 });
  assert.ok(easy < hard);
  assert.equal(DifficultyModel.level(easy), 'easy');
  assert.equal(DifficultyModel.level(hard), 'hard');
  assert.ok(DifficultyModel.fromPValue(0.95) < DifficultyModel.fromPValue(0.2));
  assert.equal(DifficultyModel.blend(2, null, 0), 2);
  assert.ok(DifficultyModel.blend(2, 5, 30) > 4);
});

test('allocation splits a count across levels exactly', () => {
  assert.deepEqual(QuestionForge.allocate(10, { easy: 4, medium: 4, hard: 2 }), { easy: 4, medium: 4, hard: 2 });
  const a = QuestionForge.allocate(7, { easy: 1, medium: 1, hard: 1 });
  assert.equal(a.easy + a.medium + a.hard, 7);
});
