// mme/docs/DocModel.js — describe a document once; render it as DOCX or PDF.
//
// Blocks:
//   title{text}  heading{text}  para{text, bold, italic, size, align, indent}
//   bullet{text}  fields{items:[label]}  rule{}  pagebreak{}
//   question{n, stem, options[], answer?}   (answer given → marked, for keys)
//   table{head[], rows[][], widths[] (fractions)}
//   image{jpeg:Buffer, width, height}

export class DocModel {
  constructor({ title = 'Document', header = '', footer = '' } = {}) {
    this.title = title; this.header = header; this.footer = footer; this.blocks = [];
  }
  add(type, props = {}) { this.blocks.push({ type, ...props }); return this; }
  titleBlock(text) { return this.add('title', { text }); }
  heading(text) { return this.add('heading', { text }); }
  para(text, o = {}) { return this.add('para', { text, ...o }); }
  bullet(text) { return this.add('bullet', { text }); }
  fields(items) { return this.add('fields', { items }); }
  rule() { return this.add('rule'); }
  pageBreak() { return this.add('pagebreak'); }
  question(q) { return this.add('question', q); }
  table(head, rows, widths) { return this.add('table', { head, rows, widths }); }
  image(jpeg, width, height) { return this.add('image', { jpeg, width, height }); }
}

/** Width/height from a JPEG's SOF marker, without decoding it. */
export function jpegSize(buf) {
  let p = 2;
  while (p < buf.length) {
    if (buf[p] !== 0xff) { p++; continue; }
    const m = buf[p + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { height: buf.readUInt16BE(p + 5), width: buf.readUInt16BE(p + 7), components: buf[p + 9] };
    }
    p += 2 + buf.readUInt16BE(p + 2);
  }
  return null;
}

export const LETTERS = 'ABCDEFGHIJ';
