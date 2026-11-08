// mme/docs/PdfWriter.js — a PDF writer with its own layout engine.
// Uses the 14 standard fonts (no embedding needed) with their AFM widths for line
// wrapping, keeps each question together with its options, repeats table headers
// across pages, embeds JPEG photos directly, and numbers the pages.
import zlib from 'node:zlib';
import { Renderer } from './Renderer.js';
import { LETTERS } from './DocModel.js';

const HELV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const HELV_B = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
const WIN = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99 };
const WIN_W = { 0x80: 556, 0x82: 222, 0x84: 333, 0x85: 1000, 0x91: 222, 0x92: 222, 0x93: 333, 0x94: 333, 0x95: 350, 0x96: 556, 0x97: 1000, 0x99: 1000 };
const SUBST = { '→': '->', '←': '<-', '✓': 'v', '✔': 'v', '₦': 'N', '×': 'x', '÷': '/', '≤': '<=', '≥': '>=', '≠': '!=', '°': '°', '\t': '    ' };

const PAGE_W = 595.28, PAGE_H = 841.89, ML = 56, MR = 56, MT = 64, MB = 64;
const CW = PAGE_W - ML - MR;

/** Unicode → WinAnsi byte codes. */
function encode(str) {
  const out = [];
  for (const ch of String(str ?? '')) {
    const s = SUBST[ch];
    if (s !== undefined && s !== ch) { for (const c of s) out.push(c.charCodeAt(0)); continue; }
    const cp = ch.codePointAt(0);
    if (cp >= 0x300 && cp <= 0x36f) continue;        // a combining tone mark on the previous letter
    if (WIN[ch]) out.push(WIN[ch]);
    else if (cp >= 32 && cp <= 126) out.push(cp);
    else if (cp >= 160 && cp <= 255) out.push(cp);
    else if (cp === 10 || cp === 13) out.push(32);
    else {
      // Strip accents we can't show ("ọ" → "o", "ẹ" → "e"), else "?".
      const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      const b = base.codePointAt(0);
      out.push(b >= 32 && b <= 126 ? b : 63);
    }
  }
  return out;
}

function width(codes, bold, size) {
  const table = bold ? HELV_B : HELV;
  let w = 0;
  for (const c of codes) w += c >= 32 && c <= 126 ? table[c - 32] : WIN_W[c] || 556;
  return (w * size) / 1000;
}

function pdfString(codes) {
  let s = '(';
  for (const c of codes) {
    if (c === 40 || c === 41 || c === 92) s += '\\' + String.fromCharCode(c);
    else if (c < 32 || c > 126) s += '\\' + c.toString(8).padStart(3, '0');
    else s += String.fromCharCode(c);
  }
  return s + ')';
}

class Page {
  constructor() { this.ops = []; this.images = new Set(); }
}

export class PdfWriter extends Renderer {
  get mime() { return 'application/pdf'; }
  get ext() { return 'pdf'; }

  // ── text measuring ─────────────────────────────────────────────────────
  wrap(text, { bold = false, size = 11, maxWidth = CW } = {}) {
    const lines = [];
    for (const paragraph of String(text ?? '').split('\n')) {
      const words = paragraph.split(/\s+/).filter(Boolean);
      let line = [];
      for (const w of words) {
        const trial = [...line, w].join(' ');
        if (width(encode(trial), bold, size) <= maxWidth || !line.length) {
          // A single word wider than the line is hard-split.
          if (!line.length && width(encode(w), bold, size) > maxWidth) {
            let chunk = '';
            for (const ch of w) {
              if (width(encode(chunk + ch), bold, size) > maxWidth) { lines.push(chunk); chunk = ''; }
              chunk += ch;
            }
            line = [chunk];
          } else line.push(w);
        } else { lines.push(line.join(' ')); line = [w]; }
      }
      lines.push(line.join(' '));
    }
    return lines;
  }

  // ── drawing ────────────────────────────────────────────────────────────
  newPage() { this.page = new Page(); this.pages.push(this.page); this.y = PAGE_H - MT; }
  ensure(h) { if (this.y - h < MB) this.newPage(); }
  gap(h) { this.y -= h; }

  text(str, x, y, { bold = false, italic = false, size = 11, color = '0.12 0.14 0.2' } = {}) {
    const font = bold ? 'F2' : italic ? 'F3' : 'F1';
    this.page.ops.push(`BT ${color} rg /${font} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td ${pdfString(encode(str))} Tj ET`);
  }

  lines(arr, { x = ML, size = 11, bold, italic, color, align, lead = 1.35, maxWidth = CW } = {}) {
    for (const l of arr) {
      this.ensure(size * lead);
      this.y -= size * lead;
      let lx = x;
      if (align === 'center') lx = ML + (CW - width(encode(l), bold, size)) / 2;
      this.text(l, lx, this.y + size * 0.3, { bold, italic, size, color });
    }
    void maxWidth;
  }

  hline(y, { color = '0.75 0.75 0.75', w = 0.6 } = {}) {
    this.page.ops.push(`${color} RG ${w} w ${ML} ${y.toFixed(2)} m ${(ML + CW).toFixed(2)} ${y.toFixed(2)} l S`);
  }

  // ── blocks ─────────────────────────────────────────────────────────────
  block(b) {
    switch (b.type) {
      case 'title': {
        this.lines(this.wrap(b.text, { bold: true, size: 18 }), { bold: true, size: 18, align: 'center', color: '0.1 0.16 0.3' });
        this.gap(4);
        break;
      }
      case 'heading': {
        this.ensure(13 * 1.35 * 3);
        this.gap(8);
        this.lines(this.wrap(b.text, { bold: true, size: 13 }), { bold: true, size: 13, color: '0.1 0.16 0.3' });
        this.gap(2);
        break;
      }
      case 'para': {
        const size = b.size || 11, x = ML + (b.indent ? 18 : 0);
        this.lines(this.wrap(b.text, { bold: b.bold, size, maxWidth: CW - (x - ML) }), { x, size, bold: b.bold, italic: b.italic, align: b.align, color: b.color });
        this.gap(4);
        break;
      }
      case 'bullet': {
        const w = this.wrap(b.text, { size: 11, maxWidth: CW - 30 });
        this.ensure(15);
        const top = this.y;
        this.text('•', ML + 10, top - 15 + 3.3, { size: 11 });
        this.lines(w, { x: ML + 24, size: 11 });
        this.gap(2);
        break;
      }
      case 'fields': {
        this.ensure(30);
        this.gap(22);
        const each = CW / b.items.length;
        b.items.forEach((label, i) => {
          const x = ML + i * each;
          this.text(label + ':', x, this.y, { bold: true, size: 11 });
          const lw = width(encode(label + ': '), true, 11);
          this.page.ops.push(`0.4 0.4 0.4 RG 0.6 w ${(x + lw).toFixed(2)} ${(this.y - 2).toFixed(2)} m ${(x + each - 12).toFixed(2)} ${(this.y - 2).toFixed(2)} l S`);
        });
        this.gap(10);
        break;
      }
      case 'rule': this.ensure(10); this.gap(6); this.hline(this.y); this.gap(6); break;
      case 'pagebreak': this.newPage(); break;
      case 'question': this.question(b); break;
      case 'table': this.table(b); break;
      case 'image': this.image(b); break;
      default: break;
    }
  }

  question(q) {
    const size = 11, lead = size * 1.35, numW = 22, optX = ML + numW + 4;
    const stem = this.wrap(q.stem, { bold: true, size, maxWidth: CW - numW });
    const opts = q.options.map((o, i) => this.wrap(`${LETTERS[i]}.  ${o}` + (q.answer === i ? '   [correct]' : ''), { bold: q.answer === i, size, maxWidth: CW - numW - 8 }));
    const h = 10 + stem.length * lead + opts.reduce((a, o) => a + o.length * lead + 2, 0) + 6;
    // Keep a question with its options; only split one that is taller than a page.
    if (h < PAGE_H - MT - MB) this.ensure(h);
    this.gap(10);
    this.ensure(lead);
    this.text(`${q.n}.`, ML, this.y - lead + size * 0.3, { bold: true, size });
    this.lines(stem, { x: ML + numW, size, bold: true });
    opts.forEach((ol, i) => {
      const right = q.answer === i;
      this.lines(ol, { x: optX, size, bold: right, color: right ? '0.04 0.48 0.23' : undefined });
      this.gap(2);
    });
    this.gap(6);
  }

  table({ head, rows, widths }) {
    const size = 9.5, lead = size * 1.3, pad = 4;
    const ws = (widths || head.map(() => 1 / head.length)).map(f => f * CW);
    const measure = (cells, bold) => cells.map((c, i) => this.wrap(String(c ?? ''), { bold, size, maxWidth: ws[i] - pad * 2 }));
    const drawRow = (cells, bold, shade) => {
      const wrapped = measure(cells, bold);
      const h = Math.max(...wrapped.map(w => w.length)) * lead + pad * 2;
      if (this.y - h < MB) { this.newPage(); if (!bold) drawRow(head, true, true); }
      const top = this.y;
      if (shade) this.page.ops.push(`0.93 0.94 0.96 rg ${ML} ${(top - h).toFixed(2)} ${CW.toFixed(2)} ${h.toFixed(2)} re f`);
      let x = ML;
      wrapped.forEach((ls, i) => {
        ls.forEach((l, k) => this.text(l, x + pad, top - pad - (k + 1) * lead + size * 0.3, { bold, size }));
        x += ws[i];
      });
      this.y = top - h;
      this.hline(this.y, { color: '0.8 0.8 0.8', w: 0.4 });
    };
    this.ensure(lead * 3);
    this.gap(4);
    drawRow(head, true, true);
    for (const r of rows) drawRow(r, false, false);
    this.gap(10);
  }

  image(b) {
    const maxH = PAGE_H - MT - MB - 20;
    let w = CW, h = (b.height / b.width) * w;
    if (h > maxH) { h = maxH; w = (b.width / b.height) * h; }
    this.ensure(h + 8);
    const name = 'Im' + (this.images.length + 1);
    this.images.push({ name, ...b });
    this.page.images.add(name);
    this.gap(h + 4);
    this.page.ops.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${(ML + (CW - w) / 2).toFixed(2)} ${this.y.toFixed(2)} cm /${name} Do Q`);
    this.gap(8);
  }

  // ── file assembly ──────────────────────────────────────────────────────
  render(doc) {
    this.pages = []; this.images = [];
    this.newPage();
    for (const b of doc.blocks) this.block(b);
    const n = this.pages.length;
    this.pages.forEach((p, i) => {
      if (doc.header) {
        const codes = encode(doc.header);
        p.ops.push(`BT 0.45 0.45 0.45 rg /F1 8.5 Tf ${(ML + CW - width(codes, false, 8.5)).toFixed(2)} ${(PAGE_H - 34).toFixed(2)} Td ${pdfString(codes)} Tj ET`);
      }
      const foot = (doc.footer ? doc.footer + '   ·   ' : '') + `Page ${i + 1} of ${n}`;
      const fc = encode(foot);
      p.ops.push(`BT 0.45 0.45 0.45 rg /F1 8.5 Tf ${(ML + (CW - width(fc, false, 8.5)) / 2).toFixed(2)} 30 Td ${pdfString(fc)} Tj ET`);
    });

    const objs = [];                      // index i → object number i+1
    const add = (body) => { objs.push(body); return objs.length; };
    const catalog = add(null), pagesObj = add(null);
    const fonts = {
      F1: add(Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')),
      F2: add(Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')),
      F3: add(Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>'))
    };
    const imgObjs = {};
    for (const im of this.images) {
      const cs = im.components === 1 ? '/DeviceGray' : im.components === 4 ? '/DeviceCMYK' : '/DeviceRGB';
      imgObjs[im.name] = add(Buffer.concat([
        Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${im.width} /Height ${im.height} /ColorSpace ${cs} /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.jpeg.length} >>\nstream\n`),
        im.jpeg, Buffer.from('\nendstream')]));
    }
    const fontRes = `/Font << ${Object.entries(fonts).map(([k, v]) => `/${k} ${v} 0 R`).join(' ')} >>`;
    const kids = [];
    for (const p of this.pages) {
      const data = zlib.deflateSync(Buffer.from(p.ops.join('\n'), 'latin1'));
      const content = add(Buffer.concat([Buffer.from(`<< /Length ${data.length} /Filter /FlateDecode >>\nstream\n`), data, Buffer.from('\nendstream')]));
      const xo = p.images.size ? ` /XObject << ${[...p.images].map(n => `/${n} ${imgObjs[n]} 0 R`).join(' ')} >>` : '';
      kids.push(add(Buffer.from(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << ${fontRes}${xo} >> /Contents ${content} 0 R >>`)));
    }
    objs[catalog - 1] = Buffer.from(`<< /Type /Catalog /Pages ${pagesObj} 0 R >>`);
    objs[pagesObj - 1] = Buffer.from(`<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`);
    const info = add(Buffer.concat([Buffer.from('<< /Title '), Buffer.from(pdfString(encode(doc.title)), 'latin1'), Buffer.from(' /Producer (MMESCHOOLS) >>')]));

    const parts = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
    let offset = parts[0].length;
    const offsets = [];
    objs.forEach((body, i) => {
      offsets.push(offset);
      const chunk = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), body, Buffer.from('\nendobj\n')]);
      parts.push(chunk);
      offset += chunk.length;
    });
    const xref = ['xref', `0 ${objs.length + 1}`, '0000000000 65535 f ', ...offsets.map(o => String(o).padStart(10, '0') + ' 00000 n ')].join('\n');
    parts.push(Buffer.from(`${xref}\ntrailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${offset}\n%%EOF\n`));
    return Buffer.concat(parts);
  }
}
Renderer.registry.pdf = () => new PdfWriter();
