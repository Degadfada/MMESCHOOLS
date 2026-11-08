// mmenyene/share/ExportService.js — turn notes, question papers, answer keys and
// results into DocModels, then into DOCX or PDF for the Share button.
import fs from 'node:fs';
import path from 'node:path';
import { HttpError } from '../../mme/http/Request.js';
import { DocModel, LETTERS, jpegSize } from '../../mme/docs/DocModel.js';
import { Renderer } from '../../mme/docs/Renderer.js';
import '../../mme/docs/DocxWriter.js';
import '../../mme/docs/PdfWriter.js';
import { Rng } from '../../mme/text/Text.js';

const safe = (s) => String(s || 'document').replace(/[^\w\- ]+/g, '').replace(/\s+/g, '_').slice(0, 80) || 'document';

export class ExportService {
  constructor({ notebook, bank, testService, scans, orgs, dataDir }) {
    Object.assign(this, { notebook, bank, testService, scans, orgs, dataDir });
  }

  render(doc, fmt, filename) {
    const r = Renderer.for(fmt === 'docx' ? 'docx' : 'pdf');
    return { buffer: r.render(doc), mime: r.mime, filename: `${safe(filename)}.${r.ext}` };
  }

  schoolLine(teacher) {
    return teacher.school_name || this.orgs.find(teacher.org_id)?.name || '';
  }

  // ── a note (or several) ───────────────────────────────────────────────────
  note(teacher, noteId, fmt, { withPhotos = true } = {}) {
    const n = this.notebook.note(teacher, noteId);
    const t = this.notebook.teachings.full(n.teaching_id);
    const doc = new DocModel({ title: n.title, header: this.schoolLine(teacher), footer: `${t.subject} · ${t.class_name}` });
    doc.titleBlock(n.title);
    doc.para(`${t.subject} · ${t.class_name}${n.topic ? ' · ' + n.topic : ''} · ${t.teacher_name}`, { align: 'center', size: 10, italic: true });
    doc.rule();
    ExportService.noteBody(doc, n.body);
    if (withPhotos && fmt !== 'docx') {
      for (const s of this.scans.where({ note_id: n.id })) {
        const file = s.image_path && path.join(this.dataDir, s.image_path);
        if (!file || !fs.existsSync(file)) continue;
        const jpeg = fs.readFileSync(file);
        const size = jpegSize(jpeg);
        if (size) { doc.pageBreak(); doc.heading('Original page'); doc.image(jpeg, size.width, size.height); }
      }
    }
    return this.render(doc, fmt, `${t.class_name} ${t.subject} ${n.title}`);
  }

  static noteBody(doc, body) {
    for (const raw of String(body || '').split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      const h = line.match(/^#{1,6}\s+(.+)/);
      const b = line.match(/^[-•*]\s+(.+)/);
      if (h) doc.heading(h[1]);
      else if (b) doc.bullet(b[1]);
      else doc.para(line);
    }
  }

  // ── a question paper / answer key ────────────────────────────────────────
  /** Version B (and C…) reorders questions and options so neighbours can't copy. */
  static version(questions, letter) {
    if (!letter || letter === 'A') return questions;
    const rng = new Rng('version-' + letter + questions.length);
    return rng.shuffle(questions).map(q => {
      const order = rng.shuffle(q.options.map((_, i) => i));
      return { ...q, options: order.map(i => q.options[i]), answer: order.indexOf(q.answer) };
    });
  }

  paperDoc(teacher, { title, teaching, questions, config = {}, variant = 'paper', version = 'A' }) {
    const qs = ExportService.version(questions, version);
    const school = this.schoolLine(teacher);
    const verTag = version && version !== 'A' ? ` (Version ${version})` : '';
    const doc = new DocModel({ title: title + verTag, header: school, footer: `${teaching.subject} · ${teaching.class_name}${verTag}` });

    if (variant === 'paper' || variant === 'both') {
      if (school) doc.para(school.toUpperCase(), { align: 'center', bold: true, size: 12 });
      doc.titleBlock(title + verTag);
      const meta = [`Subject: ${teaching.subject}`, `Class: ${teaching.class_name}`];
      if (config.durationMin) meta.push(`Time: ${config.durationMin} minutes`);
      meta.push(`Questions: ${qs.length}`);
      doc.para(meta.join('     '), { align: 'center', size: 10 });
      doc.fields(['Name', 'Class', 'Date']);
      doc.para('Instructions: ' + (config.instructions || 'Answer all questions. Choose the best option for each.'), { italic: true, size: 10 });
      doc.rule();
      qs.forEach((q, i) => doc.question({ n: i + 1, stem: q.stem, options: q.options }));
    }
    if (variant === 'key' || variant === 'both') {
      if (variant === 'both') doc.pageBreak();
      doc.titleBlock(`Answer key — ${title}${verTag}`);
      doc.para(`${teaching.subject} · ${teaching.class_name} · for the teacher only`, { align: 'center', size: 10, italic: true });
      const half = Math.ceil(qs.length / 2);
      const rows = [];
      for (let i = 0; i < half; i++) {
        const a = qs[i], b = qs[i + half];
        rows.push([String(i + 1), LETTERS[a.answer], b ? String(i + half + 1) : '', b ? LETTERS[b.answer] : '']);
      }
      doc.table(['No.', 'Answer', 'No.', 'Answer'], rows, [0.2, 0.3, 0.2, 0.3]);
      doc.heading('Marking guide');
      qs.forEach((q, i) => doc.question({ n: i + 1, stem: q.stem, options: q.options, answer: q.answer }));
      const sources = qs.map((q, i) => q.source ? [String(i + 1), q.source] : null).filter(Boolean);
      if (sources.length) {
        doc.heading('Where each answer is in the notes');
        doc.table(['No.', 'From the notes'], sources, [0.1, 0.9]);
      }
    }
    return doc;
  }

  test(teacher, testId, fmt, { variant = 'paper', version = 'A' } = {}) {
    const t = this.testService.own(teacher, testId);
    const teaching = this.notebook.teachings.full(t.teaching_id);
    const doc = this.paperDoc(teacher, { title: t.title, teaching, questions: t.paper, config: t.config, variant, version });
    const tag = variant === 'key' ? 'Answer_Key' : variant === 'both' ? 'Paper_and_Key' : 'Paper';
    return this.render(doc, fmt, `${teaching.class_name} ${teaching.subject} ${t.title} ${tag}${version !== 'A' ? ' ' + version : ''}`);
  }

  /** Straight from the Forge or the bank, before (or without) making a test. */
  questions(teacher, { teachingId, title, questions, ids, variant = 'paper', version = 'A', durationMin }, fmt) {
    const teaching = this.notebook.teaching(teacher, teachingId);
    let qs = questions;
    if (!qs && ids) qs = this.bank.snapshot(teacher, ids);
    if (!qs || !qs.length) throw new HttpError(400, 'no questions to export');
    qs = qs.map(q => ({ stem: String(q.stem), options: q.options.map(String), answer: Number(q.answer), source: q.source || null }));
    const name = title || `${teaching.subject} questions`;
    const doc = this.paperDoc(teacher, { title: name, teaching, questions: qs, config: { durationMin }, variant, version });
    return this.render(doc, fmt, `${teaching.class_name} ${teaching.subject} ${name} ${variant === 'key' ? 'Answer_Key' : 'Paper'}`);
  }

  // ── results ──────────────────────────────────────────────────────────────
  results(teacher, testId, fmt) {
    const snap = this.testService.results(teacher, testId);
    const t = this.testService.own(teacher, testId);
    const teaching = this.notebook.teachings.full(t.teaching_id);
    const doc = new DocModel({ title: `${t.title} — results`, header: this.schoolLine(teacher), footer: `${teaching.subject} · ${teaching.class_name}` });
    doc.titleBlock(`${t.title} — results`);
    doc.para(`${teaching.subject} · ${teaching.class_name} · ${new Date(t.opened_at || t.created).toLocaleDateString('en-GB')}`, { align: 'center', size: 10, italic: true });
    const s = snap.summary;
    doc.para(`Students: ${s.joined}    Finished: ${s.finished}    Average: ${s.average ?? '–'}%    Highest: ${s.highest ?? '–'}%    Lowest: ${s.lowest ?? '–'}%`, { align: 'center', size: 10 });
    const rows = snap.students.slice().sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || a.name.localeCompare(b.name))
      .map((st, i) => [String(i + 1), st.name, st.finished ? `${st.score}/${st.total}` : 'not submitted', st.pct != null ? st.pct + '%' : '', st.band || '']);
    doc.table(['#', 'Name', 'Score', '%', 'Remark'], rows, [0.07, 0.4, 0.18, 0.1, 0.25]);
    doc.heading('How each question went');
    doc.table(['No.', 'Question', 'Correct', 'Most chosen wrong option'],
      snap.items.map((it, i) => [String(i + 1), it.stem, it.answered ? `${Math.round(100 * it.p)}%` : '–',
        it.commonWrong ? `${it.options[it.commonWrong.option]} (${it.commonWrong.n})` : '–']),
      [0.07, 0.53, 0.12, 0.28]);
    return this.render(doc, fmt, `${teaching.class_name} ${teaching.subject} ${t.title} Results`);
  }
}
