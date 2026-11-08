// mmenyene/notebook/DocxImporter.js — read paragraphs (and headings) out of a .docx.
// Ported from the IDA Tech cert app's lib/docx.js, now keeping heading styles so a
// teacher's Word scheme of work lands as topics.
import { ZipReader } from '../../mme/docs/Zip.js';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export class DocxImporter {
  static unescape(s) {
    return s.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (m, e) => {
      if (e[0] === '#') {
        const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e] !== undefined ? ENTITIES[e] : m;
    });
  }

  /** @returns {{text:string, heading:boolean, listed:boolean}[]} */
  paragraphs(buf) {
    const xml = new ZipReader(buf).read('word/document.xml').toString('utf8');
    const out = [];
    for (const p of xml.split(/<w:p[ >]/).slice(1)) {
      const body = p.slice(0, p.indexOf('</w:p>') + 1 || undefined);
      let text = '';
      const re = /<w:(t|tab|br)\b([^>]*)>/g;
      let m;
      while ((m = re.exec(body))) {
        if (m[1] !== 't') { text += ' '; continue; }
        if (m[2].endsWith('/')) continue;
        const end = body.indexOf('</w:t>', re.lastIndex);
        if (end < 0) break;
        text += body.slice(re.lastIndex, end);
        re.lastIndex = end + 6;
      }
      const line = DocxImporter.unescape(text).replace(/[-]/g, '•').replace(/\s+/g, ' ').trim();
      if (!line) continue;
      const style = (body.match(/<w:pStyle w:val="([^"]+)"/) || [])[1] || '';
      out.push({ text: line, heading: /^(heading|title)/i.test(style), listed: /<w:numPr[ >/]/.test(body) });
    }
    return out;
  }

  /** Convert to the notebook's plain-text convention: "# Heading", "- bullet". */
  toNoteText(buf) {
    return this.paragraphs(buf).map(p =>
      p.heading ? '# ' + p.text : p.listed ? '- ' + p.text.replace(/^•\s*/, '') : p.text
    ).join('\n');
  }
}
