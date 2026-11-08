// mme/docs/DocxWriter.js — WordprocessingML written by hand and zipped with our own
// ZipWriter. Opens in Word, WPS Office (common on teachers' phones), LibreOffice and
// Google Docs.
import { Renderer } from './Renderer.js';
import { ZipWriter } from './Zip.js';
import { LETTERS } from './DocModel.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // XML 1.0 forbids most control characters.
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

function run(text, { bold, italic, size, color } = {}) {
  let rpr = '';
  if (bold) rpr += '<w:b/>';
  if (italic) rpr += '<w:i/>';
  if (color) rpr += `<w:color w:val="${color}"/>`;
  if (size) rpr += `<w:sz w:val="${Math.round(size * 2)}"/><w:szCs w:val="${Math.round(size * 2)}"/>`;
  return `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

function para(runs, { style, align, indent, keepNext, spaceAfter, spaceBefore } = {}) {
  let ppr = '';
  if (style) ppr += `<w:pStyle w:val="${style}"/>`;
  if (keepNext) ppr += '<w:keepNext/>';
  if (spaceAfter !== undefined || spaceBefore !== undefined) ppr += `<w:spacing w:before="${spaceBefore ?? 0}" w:after="${spaceAfter ?? 120}"/>`;
  if (indent) ppr += `<w:ind w:left="${indent}"/>`;
  if (align) ppr += `<w:jc w:val="${align}"/>`;
  return `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${runs}</w:p>`;
}

export class DocxWriter extends Renderer {
  get mime() { return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'; }
  get ext() { return 'docx'; }

  body(doc) {
    const out = [];
    for (const b of doc.blocks) {
      switch (b.type) {
        case 'title': out.push(para(run(b.text), { style: 'Title', align: 'center' })); break;
        case 'heading': out.push(para(run(b.text), { style: 'Heading1', keepNext: true })); break;
        case 'para': out.push(para(run(b.text, b), { align: b.align === 'center' ? 'center' : undefined, indent: b.indent ? 360 : undefined })); break;
        case 'bullet': out.push(para(run('•  ' + b.text), { indent: 360, spaceAfter: 60 })); break;
        case 'fields': out.push(para(b.items.map((l, i) => run((i ? '      ' : '') + l + ': ', { bold: true }) + run('______________________')).join(''), { spaceAfter: 240 })); break;
        case 'rule': out.push('<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="999999"/></w:pBdr></w:pPr></w:p>'); break;
        case 'pagebreak': out.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>'); break;
        case 'question': {
          out.push(para(run(`${b.n}.  `, { bold: true }) + run(b.stem, { bold: true }), { keepNext: true, spaceBefore: 160, spaceAfter: 60 }));
          b.options.forEach((o, i) => {
            const right = b.answer === i;
            out.push(para(run(`${LETTERS[i]}.  ${o}`, { bold: right, color: right ? '0B7A3B' : undefined }) + (right ? run('   ✓', { bold: true, color: '0B7A3B' }) : ''),
              { indent: 480, keepNext: i < b.options.length - 1, spaceAfter: 40 }));
          });
          break;
        }
        case 'table': out.push(this.table(b)); break;
        case 'image': out.push(para(run('[page photo — see the PDF version]', { italic: true, color: '777777' }))); break;
        default: break;
      }
    }
    return out.join('');
  }

  table({ head, rows, widths }) {
    const total = 9000;
    const w = (i) => Math.round(total * (widths ? widths[i] : 1 / head.length));
    const cell = (text, i, bold) => `<w:tc><w:tcPr><w:tcW w:w="${w(i)}" w:type="dxa"/></w:tcPr>${para(run(text, { bold, size: 10 }), { spaceAfter: 0 })}</w:tc>`;
    const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(s => `<w:${s} w:val="single" w:sz="4" w:color="BBBBBB"/>`).join('');
    return `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/><w:tblBorders>${borders}</w:tblBorders></w:tblPr>` +
      `<w:tr>${head.map((h, i) => cell(h, i, true)).join('')}</w:tr>` +
      rows.map(r => `<w:tr>${r.map((c, i) => cell(String(c ?? ''), i, false)).join('')}</w:tr>`).join('') +
      '</w:tbl>' + para('', { spaceAfter: 120 });
  }

  render(doc) {
    const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${this.body(doc)}` +
      `<w:sectPr><w:headerReference w:type="default" r:id="rIdH"/><w:footerReference w:type="default" r:id="rIdF"/>` +
      `<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    const header = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${W}>${para(run(doc.header || '', { size: 9, color: '666666' }), { align: 'right', spaceAfter: 0 })}</w:hdr>`;
    const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${W}><w:p><w:pPr><w:jc w:val="center"/></w:pPr>` +
      run((doc.footer ? doc.footer + '   ·   ' : '') + 'Page ', { size: 9, color: '666666' }) +
      `<w:fldSimple w:instr="PAGE"><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}>` +
      `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault>` +
      `<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
      `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>` +
      `<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/><w:color w:val="1F2A44"/></w:rPr></w:style>` +
      `<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/><w:color w:val="1F2A44"/></w:rPr></w:style>` +
      `</w:styles>`;
    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `<Relationship Id="rIdH" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>` +
      `<Relationship Id="rIdF" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>`;
    const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
      `<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>` +
      `<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>` +
      `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
    const root = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
      `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
    const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
      `<dc:title>${esc(doc.title)}</dc:title><dc:creator>MMESCHOOLS</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created></cp:coreProperties>`;
    return new ZipWriter()
      .add('[Content_Types].xml', types).add('_rels/.rels', root).add('docProps/core.xml', core)
      .add('word/document.xml', document).add('word/styles.xml', styles)
      .add('word/header1.xml', header).add('word/footer1.xml', footer)
      .add('word/_rels/document.xml.rels', rels)
      .toBuffer();
  }
}
Renderer.registry.docx = () => new DocxWriter();
