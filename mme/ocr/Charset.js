// mme/ocr/Charset.js — what the network can tell apart.
//
// Like EMNIST's "balanced" split: letters whose small and capital forms have the same
// shape (c/C, o/O, s/S …) share one class, and the decoder picks the case from the
// glyph's size relative to the line. Punctuation is read from geometry, not the network.

// The last class, '~', means "not one letter" (half a letter, two letters, a smudge):
// it lets the decoder reject a bad way of cutting a word.
export const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabdefghnqrt~';
export const REJECT = CHARSET.length - 1;
export const MERGED = new Set('CIJKLMOPSUVWXYZ'.split(''));

/** The training label (class index) for a written character, or -1 if not a class. */
export function classOf(ch) {
  if (ch === 'l') return CHARSET.indexOf('I');           // a lower-case l is a bar, like I
  if (CHARSET.includes(ch)) return CHARSET.indexOf(ch);
  const up = ch.toUpperCase();
  if (/[a-z]/.test(ch) && MERGED.has(up)) return CHARSET.indexOf(up);
  return -1;
}

/** Characters a class can stand for, most likely first, given the glyph's relative height. */
export function readingsOf(cls, { tall = true, dotted = false } = {}) {
  const ch = CHARSET[cls];
  if (cls === REJECT) return [];
  if (dotted && ch === 'I') return ['i', 'j', 'l'];
  if (dotted && ch === 'J') return ['j', 'i'];
  // Shapes easily confused in handwriting; the language model breaks the tie.
  const alt = {
    0: ['0', 'o', 'O'], 1: ['1', 'l', 'I'], 5: ['5', 's', 'S'], 2: ['2', 'z', 'Z'], 9: ['9', 'g', 'q'], 6: ['6', 'b'],
    I: tall ? ['l', 'I', '1', 'i'] : ['i', 'l', 'I'], O: tall ? ['O', 'o', '0'] : ['o', 'O', '0'],
    g: ['g', 'q', '9'], q: ['q', 'g'], h: ['h', 'n', 'b'], n: ['n', 'h', 'r'], a: ['a', 'd', 'o'], r: ['r', 'n'], t: ['t', 'f'], f: ['f', 't'],
    U: tall ? ['U', 'u', 'v'] : ['u', 'U', 'v'], V: tall ? ['V', 'v', 'u'] : ['v', 'V', 'u'], e: ['e', 'c'], b: ['b', 'h', '6'], d: ['d', 'a']
  }[ch];
  if (alt) return alt;
  if (MERGED.has(ch)) return tall ? [ch, ch.toLowerCase()] : [ch.toLowerCase(), ch];
  return [ch];
}
