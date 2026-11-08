import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Network } from '../mme/ocr/nn/Network.js';
import { softmax } from '../mme/ocr/nn/Layers.js';
import { homography } from '../mme/ocr/pipeline/Stages.js';
import { GrayImage } from '../mme/ocr/Image.js';
import { SauvolaBinarize, RuledLineRemover, Deskew } from '../mme/ocr/pipeline/Stages.js';
import { classOf, readingsOf, CHARSET, REJECT } from '../mme/ocr/Charset.js';
import { CorrectionHarvester } from '../mme/ocr/learn/CorrectionHarvester.js';

test('network gradients match finite differences', () => {
  const net = Network.create(CHARSET.length, 3);
  net.layers.find(l => l.constructor.name === 'Dropout').p = 0;
  const x = new Float32Array(784).map((_, i) => ((i * 7919) % 101) / 101);
  const y = 5;
  const loss = () => -Math.log(softmax(net.logits(x, true))[y]);
  const p = softmax(net.logits(x, true)); p[y] -= 1; net.backward(p);
  let worst = 0;
  for (const layer of net.layers.filter(l => l.params.length)) {
    const prm = layer.params[0];
    for (let t = 0; t < 4; t++) {
      const i = (t * 2654435761) % prm.w.length, g = prm.g[i], o = prm.w[i];
      prm.w[i] = o + 1e-3; const a = loss(); prm.w[i] = o - 1e-3; const b = loss(); prm.w[i] = o;
      const num = (a - b) / 2e-3;
      if (Math.abs(num) + Math.abs(g) > 1e-4) worst = Math.max(worst, Math.abs(num - g) / (Math.abs(num) + Math.abs(g)));
    }
  }
  assert.ok(worst < 0.05, 'relative error ' + worst);
});

test('network serialises and loads back identically', () => {
  const a = Network.create(CHARSET.length, 11);
  const b = Network.deserialize(a.serialize());
  const x = new Float32Array(784).fill(0.3);
  assert.deepEqual([...a.predict(x)].map(v => v.toFixed(6)), [...b.predict(x)].map(v => v.toFixed(6)));
});

test('homography maps the corners exactly', () => {
  const src = [[0, 0], [99, 0], [99, 149], [0, 149]], dst = [[10, 5], [120, 12], [118, 160], [4, 150]];
  const h = homography(src, dst);
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], d = h[6] * x + h[7] * y + 1;
    assert.ok(Math.abs((h[0] * x + h[1] * y + h[2]) / d - dst[i][0]) < 1e-6);
    assert.ok(Math.abs((h[3] * x + h[4] * y + h[5]) / d - dst[i][1]) < 1e-6);
  }
});

test('ruled lines are removed, writing is kept', () => {
  const g = new GrayImage(400, 200);
  for (let x = 0; x < 400; x++) { g.data[100 * 400 + x] = 0.6; g.data[101 * 400 + x] = 0.6; }      // ruled line
  for (let y = 60; y < 140; y++) for (let x = 200; x < 206; x++) g.data[y * 400 + x] = 0.1;           // a pen stroke crossing it
  const ctx = { gray: g };
  new SauvolaBinarize().run(ctx);
  new RuledLineRemover().run(ctx);
  assert.equal(ctx.bin.data[100 * 400 + 50], 0, 'line pixel away from the stroke should be gone');
  assert.equal(ctx.bin.data[100 * 400 + 202], 1, 'stroke pixel on the line should stay');
});

test('deskew finds the tilt of a page of lines', () => {
  const g = new GrayImage(600, 400);
  for (let k = 0; k < 8; k++) for (let x = 40; x < 560; x += 3) for (let t = 0; t < 6; t++) {
    const y = Math.round(40 + k * 45 + x * Math.tan((3 * Math.PI) / 180)) + t;
    if (y < 400 && (x % 9) < 6) g.data[y * 600 + x] = 0.1;
  }
  const ctx = { gray: g };
  new SauvolaBinarize().run(ctx);
  const deg = Deskew.estimate(ctx.bin);
  assert.ok(Math.abs(deg - 3) <= 0.5, 'estimated ' + deg);
});

test('charset: shared-shape letters and case readings', () => {
  assert.equal(classOf('c'), classOf('C'));
  assert.equal(classOf('l'), classOf('I'));
  assert.notEqual(classOf('a'), classOf('A'));
  assert.equal(classOf('?'), -1);
  assert.equal(CHARSET[REJECT], '~');
  assert.deepEqual(readingsOf(CHARSET.indexOf('C'), { tall: false }), ['c', 'C']);
  assert.equal(readingsOf(CHARSET.indexOf('I'), { dotted: true })[0], 'i');
  assert.deepEqual(readingsOf(REJECT), []);
});

test('harvester labels glyphs only where the corrected word fits', () => {
  const px = () => new Float32Array(784).fill(0.5);
  const result = { lines: [{ words: [
    { text: 'tbe', glyphs: [{ px: px() }, { px: px() }, { px: px() }], negatives: [px()] },
    { text: 'cat', glyphs: [{ px: px() }, { px: px() }], negatives: [] }
  ] }] };
  const out = new CorrectionHarvester().harvest(result, 'the cat', { keepConfirmed: 1 });
  const letters = out.filter(s => s.label !== '~');
  assert.deepEqual(letters.map(s => s.label), ['t', 'h', 'e']);        // "cat" had 2 glyphs for 3 letters: skipped
  assert.equal(letters.filter(s => s.corrected).length, 1);           // only b→h was a correction
  assert.equal(out.filter(s => s.label === '~').length, 1);            // the known wrong cut became a reject
});
