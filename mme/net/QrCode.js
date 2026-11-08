// mme/net/QrCode.js — a QR Code encoder written from the ISO/IEC 18004 rules.
// Byte mode, error-correction level M, versions 1–20 (plenty for a test link).
// Runs in node and in the browser. QrCode.encode(text).toSvg()

const ECC_PER_BLOCK_M = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26];
const BLOCKS_M        = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16];
const ECL_FORMAT_M = 0;

function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
  return z & 0xff;
}
function rsDivisor(degree) {
  const r = new Array(degree).fill(0); r[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < r.length; j++) { r[j] = gfMul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
    root = gfMul(root, 0x02);
  }
  return r;
}
function rsRemainder(data, divisor) {
  const r = divisor.map(() => 0);
  for (const b of data) {
    const f = b ^ r.shift(); r.push(0);
    divisor.forEach((c, i) => { r[i] ^= gfMul(c, f); });
  }
  return r;
}
const bit = (x, i) => ((x >>> i) & 1) !== 0;

function rawModules(ver) {
  let r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) { const n = Math.floor(ver / 7) + 2; r -= (25 * n - 10) * n - 55; if (ver >= 7) r -= 36; }
  return r;
}
const dataCodewords = (ver) => Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK_M[ver] * BLOCKS_M[ver];

function alignPositions(ver) {
  if (ver === 1) return [];
  const n = Math.floor(ver / 7) + 2, size = ver * 4 + 17;
  const step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
  const out = [6];
  for (let pos = size - 7; out.length < n; pos -= step) out.splice(1, 0, pos);
  return out;
}

export class QrCode {
  constructor(ver) {
    this.version = ver;
    this.size = ver * 4 + 17;
    this.m = Array.from({ length: this.size }, () => new Array(this.size).fill(false));
    this.fn = Array.from({ length: this.size }, () => new Array(this.size).fill(false));
  }

  static encode(text) {
    const bytes = [...new TextEncoder().encode(String(text))];
    let ver = 1;
    for (; ver <= 20; ver++) {
      const ccBits = ver <= 9 ? 8 : 16;
      if (4 + ccBits + bytes.length * 8 <= dataCodewords(ver) * 8) break;
    }
    if (ver > 20) throw new Error('text too long for QR');
    const bits = [];
    const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(0b0100, 4); put(bytes.length, ver <= 9 ? 8 : 16);
    for (const b of bytes) put(b, 8);
    const cap = dataCodewords(ver) * 8;
    put(0, Math.min(4, cap - bits.length));
    while (bits.length % 8) bits.push(0);
    for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));

    const qr = new QrCode(ver);
    qr._drawFunctionPatterns();
    qr._drawCodewords(qr._withEcc(data));
    // Pick the mask with the lowest penalty.
    let best = 0, bestScore = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      qr._applyMask(mask); qr._drawFormat(mask);
      const s = qr._penalty();
      if (s < bestScore) { bestScore = s; best = mask; }
      qr._applyMask(mask);
    }
    qr._applyMask(best); qr._drawFormat(best);
    qr.mask = best;
    return qr;
  }

  _set(x, y, dark) { this.m[y][x] = dark; this.fn[y][x] = true; }

  _drawFunctionPatterns() {
    const s = this.size;
    for (let i = 0; i < s; i++) { this._set(6, i, i % 2 === 0); this._set(i, 6, i % 2 === 0); }
    for (const [cx, cy] of [[3, 3], [s - 4, 3], [3, s - 4]]) {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < s && y >= 0 && y < s) this._set(x, y, d !== 2 && d !== 4);
      }
    }
    const pos = alignPositions(this.version), n = pos.length;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
        this._set(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    this._drawFormat(0);
    if (this.version >= 7) {
      let rem = this.version;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const bits = (this.version << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const b = bit(bits, i), a = s - 11 + (i % 3), c = Math.floor(i / 3);
        this._set(a, c, b); this._set(c, a, b);
      }
    }
  }

  _drawFormat(mask) {
    const data = (ECL_FORMAT_M << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const s = this.size;
    for (let i = 0; i <= 5; i++) this._set(8, i, bit(bits, i));
    this._set(8, 7, bit(bits, 6)); this._set(8, 8, bit(bits, 7)); this._set(7, 8, bit(bits, 8));
    for (let i = 9; i < 15; i++) this._set(14 - i, 8, bit(bits, i));
    for (let i = 0; i < 8; i++) this._set(s - 1 - i, 8, bit(bits, i));
    for (let i = 8; i < 15; i++) this._set(8, s - 15 + i, bit(bits, i));
    this._set(8, s - 8, true);
  }

  _withEcc(data) {
    const ver = this.version, nBlocks = BLOCKS_M[ver], eccLen = ECC_PER_BLOCK_M[ver];
    const raw = Math.floor(rawModules(ver) / 8);
    const nShort = nBlocks - (raw % nBlocks), shortLen = Math.floor(raw / nBlocks);
    const div = rsDivisor(eccLen);
    const blocks = [];
    for (let i = 0, k = 0; i < nBlocks; i++) {
      const dat = data.slice(k, k + shortLen - eccLen + (i < nShort ? 0 : 1));
      k += dat.length;
      const ecc = rsRemainder(dat, div);
      if (i < nShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    const out = [];
    for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => {
      if (i !== shortLen - eccLen || j >= nShort) out.push(b[i]);
    });
    return out;
  }

  _drawCodewords(data) {
    const s = this.size;
    let i = 0;
    for (let right = s - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let v = 0; v < s; v++) for (let j = 0; j < 2; j++) {
        const x = right - j, up = ((right + 1) & 2) === 0, y = up ? s - 1 - v : v;
        if (!this.fn[y][x] && i < data.length * 8) { this.m[y][x] = bit(data[i >>> 3], 7 - (i & 7)); i++; }
      }
    }
  }

  _applyMask(mask) {
    const f = [
      (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
      (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => (((x + y) % 2) + (x * y) % 3) % 2 === 0
    ][mask];
    for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++)
      if (!this.fn[y][x] && f(x, y)) this.m[y][x] = !this.m[y][x];
  }

  // Rules 1, 2 and 4 of the spec's penalty (rule 3 only fine-tunes readability).
  _penalty() {
    const s = this.size, m = this.m;
    let p = 0, dark = 0;
    for (let a = 0; a < s; a++) {
      let runR = 1, runC = 1;
      for (let b = 1; b < s; b++) {
        if (m[a][b] === m[a][b - 1]) { runR++; if (runR === 5) p += 3; else if (runR > 5) p++; } else runR = 1;
        if (m[b][a] === m[b - 1][a]) { runC++; if (runC === 5) p += 3; else if (runC > 5) p++; } else runC = 1;
      }
    }
    for (let y = 0; y < s - 1; y++) for (let x = 0; x < s - 1; x++) {
      const c = m[y][x];
      if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3;
    }
    for (const row of m) for (const c of row) if (c) dark++;
    p += Math.floor(Math.abs(dark * 20 - s * s * 10) / (s * s)) * 10;
    return p;
  }

  toSvg({ border = 4, dark = '#000', light = '#fff' } = {}) {
    const n = this.size + border * 2;
    let d = '';
    for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++)
      if (this.m[y][x]) d += `M${x + border},${y + border}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges">` +
      `<rect width="100%" height="100%" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
  }
}
