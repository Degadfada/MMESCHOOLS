// mme/docs/Zip.js — read and write .zip containers (which is what .docx is) with only
// node's zlib. Reader ported from the IDA Tech cert app's lib/docx.js.
import zlib from 'node:zlib';

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
export function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

export class ZipReader {
  constructor(buf) {
    this.buf = buf;
    this.entries = new Map();
    let eocd = -1;
    for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
      if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('not a zip file');
    const count = buf.readUInt16LE(eocd + 10);
    let p = buf.readUInt32LE(eocd + 16);
    for (let n = 0; n < count; n++) {
      if (buf.readUInt32LE(p) !== 0x02014b50) break;
      const method = buf.readUInt16LE(p + 10), compSize = buf.readUInt32LE(p + 20);
      const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commLen = buf.readUInt16LE(p + 32);
      const localOff = buf.readUInt32LE(p + 42);
      const name = buf.slice(p + 46, p + 46 + nameLen).toString('utf8');
      this.entries.set(name, { method, compSize, localOff });
      p += 46 + nameLen + extraLen + commLen;
    }
  }
  has(name) { return this.entries.has(name); }
  read(name) {
    const e = this.entries.get(name);
    if (!e) throw new Error('entry not found: ' + name);
    const b = this.buf, start = e.localOff + 30 + b.readUInt16LE(e.localOff + 26) + b.readUInt16LE(e.localOff + 28);
    const raw = b.slice(start, start + e.compSize);
    return e.method === 0 ? raw : zlib.inflateRawSync(raw);
  }
}

export class ZipWriter {
  constructor() { this.files = []; }

  add(name, data) {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
    this.files.push({ name: Buffer.from(name, 'utf8'), data: buf });
    return this;
  }

  toBuffer() {
    const locals = [], centrals = [];
    let offset = 0;
    const dosTime = 0, dosDate = (2026 - 1980) << 9 | 1 << 5 | 1;
    for (const f of this.files) {
      const comp = zlib.deflateRawSync(f.data);
      const useStore = comp.length >= f.data.length;
      const body = useStore ? f.data : comp;
      const crc = crc32(f.data);
      const lh = Buffer.alloc(30);
      lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6);
      lh.writeUInt16LE(useStore ? 0 : 8, 8); lh.writeUInt16LE(dosTime, 10); lh.writeUInt16LE(dosDate, 12);
      lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(f.data.length, 22);
      lh.writeUInt16LE(f.name.length, 26); lh.writeUInt16LE(0, 28);
      locals.push(lh, f.name, body);

      const ch = Buffer.alloc(46);
      ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8);
      ch.writeUInt16LE(useStore ? 0 : 8, 10); ch.writeUInt16LE(dosTime, 12); ch.writeUInt16LE(dosDate, 14);
      ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(f.data.length, 24);
      ch.writeUInt16LE(f.name.length, 28); ch.writeUInt32LE(offset, 42);
      centrals.push(ch, f.name);
      offset += 30 + f.name.length + body.length;
    }
    const cd = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(this.files.length, 8); end.writeUInt16LE(this.files.length, 10);
    end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, cd, end]);
  }
}
