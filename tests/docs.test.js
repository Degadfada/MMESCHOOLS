import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DocModel, jpegSize } from '../mme/docs/DocModel.js';
import { DocxWriter } from '../mme/docs/DocxWriter.js';
import { PdfWriter } from '../mme/docs/PdfWriter.js';
import { ZipReader, ZipWriter, crc32 } from '../mme/docs/Zip.js';
import { DocxImporter } from '../mmenyene/notebook/DocxImporter.js';
import { ExportService } from '../mmenyene/share/ExportService.js';
import { QrCode } from '../mme/net/QrCode.js';

const paper = () => {
  const d = new DocModel({ title: 'Test', header: 'Unity Secondary School' });
  d.titleBlock('First Term Test');
  d.fields(['Name', 'Class']);
  for (let i = 1; i <= 25; i++) d.question({ n: i, stem: `Question number ${i}: which of these is right?`, options: ['Alpha', 'Beta', 'Gamma — a long option ' + 'x'.repeat(i * 3), 'Delta'] });
  d.table(['No.', 'Answer'], [['1', 'A'], ['2', 'B']]);
  return d;
};

test('zip round-trip and crc32', () => {
  assert.equal(crc32(Buffer.from('hello')), 0x3610a686);
  const z = new ZipWriter().add('a.txt', 'hello').add('b/c.xml', '<x/>'.repeat(200)).toBuffer();
  const r = new ZipReader(z);
  assert.equal(r.read('a.txt').toString(), 'hello');
  assert.equal(r.read('b/c.xml').toString().length, 800);
});

test('DOCX opens with our own reader and keeps the text', () => {
  const buf = new DocxWriter().render(paper());
  const text = new DocxImporter().toNoteText(buf);
  assert.match(text, /First Term Test/);
  assert.match(text, /25\.\s+Question number 25/);
  assert.match(text, /D\.\s+Delta/);
});

test('PDF is well-formed: header, xref offsets, page count', () => {
  const buf = new PdfWriter().render(paper());
  const s = buf.toString('latin1');
  assert.ok(s.startsWith('%PDF-1.4'));
  assert.ok(s.trimEnd().endsWith('%%EOF'));
  const startxref = Number(s.match(/startxref\n(\d+)/)[1]);
  assert.equal(s.slice(startxref, startxref + 4), 'xref');
  const entries = [...s.slice(startxref).matchAll(/(\d{10}) 00000 n /g)].map(m => Number(m[1]));
  entries.forEach((off, i) => assert.ok(s.slice(off).startsWith(`${i + 1} 0 obj`), `object ${i + 1} offset`));
  const count = Number(s.match(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/)[1]);
  assert.ok(count >= 2, 'a 25-question paper spans pages');
});

test('a question is never split from its options across pages', () => {
  const w = new PdfWriter();
  w.render(paper());
  // On every page, each question number has its last option ("D. Delta") on the same page.
  w.pages.forEach((p, i) => {
    const ops = p.ops.join('\n');
    const nums = (ops.match(/\(\d+\.\) Tj/g) || []).length;
    const lastOptions = (ops.match(/\(D\. Delta\) Tj/g) || []).length;
    assert.equal(lastOptions, nums, `page ${i + 1}: ${nums} questions but ${lastOptions} complete option lists`);
  });
});

test('student paper never contains the answers; key does', () => {
  const qs = [{ stem: 'What is H2O?', options: ['Salt', 'Water', 'Air', 'Fire'], answer: 1, source: 'Water is H2O.' }];
  const svc = new ExportService({ orgs: { find: () => ({ name: 'Team' }) } });
  const teaching = { subject: 'Basic Science', class_name: 'JSS1' };
  const p = svc.paperDoc({ school_name: 'S' }, { title: 'Quiz', teaching, questions: qs, variant: 'paper' });
  assert.ok(p.blocks.filter(b => b.type === 'question').every(b => b.answer === undefined));
  assert.ok(!p.blocks.some(b => b.type === 'table'));
  const k = svc.paperDoc({ school_name: 'S' }, { title: 'Quiz', teaching, questions: qs, variant: 'key' });
  assert.ok(k.blocks.some(b => b.type === 'question' && b.answer === 1));
});

test('version B reorders but keeps every answer right', () => {
  const qs = Array.from({ length: 8 }, (_, i) => ({ stem: 'Q' + i, options: ['a' + i, 'b' + i, 'c' + i, 'd' + i], answer: i % 4 }));
  const b = ExportService.version(qs, 'B');
  assert.notDeepEqual(b.map(q => q.stem), qs.map(q => q.stem));
  for (const q of b) { const orig = qs.find(o => o.stem === q.stem); assert.equal(q.options[q.answer], orig.options[orig.answer]); }
});

test('jpeg size is read from the header', () => {
  const sof = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x02, 0x58, 0x03]);
  assert.deepEqual(jpegSize(sof), { height: 300, width: 600, components: 3 });
});

test('QR codes have the right size for their version', () => {
  const q = QrCode.encode('https://abc-def-ghi.trycloudflare.com/t/ABC123');
  assert.equal(q.size, q.version * 4 + 17);
  assert.match(q.toSvg(), /^<svg/);
  // Finder pattern corners are dark, separators light.
  assert.equal(q.m[0][0], true); assert.equal(q.m[7][7], false);
});
