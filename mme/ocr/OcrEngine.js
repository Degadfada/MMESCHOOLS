// mme/ocr/OcrEngine.js — photo of a notebook page → lines of words, each with a
// confidence, alternatives, its box on the page, and the glyphs it was read from
// (kept so the teacher's corrections can teach the model her handwriting).
import { GrayImage } from './Image.js';
import { Pipeline } from './pipeline/Stage.js';
import { PageDetector, PerspectiveWarp, IlluminationFlatten, SauvolaBinarize, RuledLineRemover, Deskew } from './pipeline/Stages.js';
import { Components } from './layout/Components.js';
import { LineSegmenter } from './layout/LineSegmenter.js';
import { WordSegmenter } from './layout/WordSegmenter.js';
import { CutPointFinder } from './layout/CutPointFinder.js';
import { Glyph } from './layout/Glyph.js';
import { Network } from './nn/Network.js';
import { Lexicon } from './lang/Lexicon.js';
import { CharNgram } from './lang/CharNgram.js';
import { BeamDecoder } from './lang/BeamDecoder.js';

export class OcrEngine {
  constructor({ net, lexicon = new Lexicon() }) {
    this.net = net;
    this.lexicon = lexicon;
    this.ngram = new CharNgram().train(lexicon.freq.entries());
    this.decoder = new BeamDecoder({ net, lexicon, ngram: this.ngram });
  }

  static fromBuffers({ model, words = [], notesText = '' }) {
    const lex = new Lexicon().addRanked(words).addText(notesText);
    return new OcrEngine({ net: Network.deserialize(model), lexicon: lex });
  }

  preprocess(gray, { quad, maxSide = 2000, onProgress } = {}) {
    const { img, scale } = gray.fitWithin(maxSide);
    const ctx = { gray: img, quad: quad ? quad.map(([x, y]) => [x * scale, y * scale]) : null };
    const binarize = new SauvolaBinarize(), lines = new RuledLineRemover();
    new Pipeline([new PageDetector(), new PerspectiveWarp({ maxSide }), new IlluminationFlatten(), binarize, lines, new Deskew({ binarizer: binarize, lineRemover: lines })]).run(ctx, onProgress);
    if (ctx.detectedQuad) ctx.detectedQuad = ctx.detectedQuad.map(([x, y]) => [x / scale, y / scale]);
    return ctx;
  }

  /**
   * Handwriting's word gaps are sometimes no wider than its letter gaps. Mid-sized gaps
   * inside a "word" are therefore optional spaces: we decode the alternatives and keep
   * the split whose parts read best (real words beat letter soup).
   */
  splitWord(w, line, labels, W) {
    const cache = new Map();
    const glyphAt = (a, b) => {
      const k = a * 1000 + b;
      if (!cache.has(k)) cache.set(k, Glyph.fromPieces(w.pieces, a, b, labels, W));
      return cache.get(k);
    };
    const cl = w.clusters;
    const xh = line.xHeight;
    // Candidate split points: gaps between clusters, the widest few.
    const gaps = [];
    for (let i = 1; i < cl.length; i++) {
      const g = cl[i].x0 - Math.max(...cl.slice(0, i).map(c => c.x1));
      if (g >= Math.max(3, xh * 0.24)) gaps.push({ at: i, g });
    }
    const cuts = gaps.sort((a, b) => b.g - a.g).slice(0, 5).sort((a, b) => a.at - b.at);
    const bounds = [0, ...cuts.map(c => c.at), cl.length];
    // Decode the clusters between two boundaries as one word.
    const memo = new Map();
    const part = (i, j) => {
      const key = i + ':' + j;
      if (memo.has(key)) return memo.get(key);
      const a = w.pieces.findIndex(p => p.clusterIndex >= bounds[i]);
      let b = w.pieces.length - 1;
      while (b > a && w.pieces[b].clusterIndex >= bounds[j]) b--;
      const sub = { pieces: w.pieces.slice(a, b + 1), clusters: cl.slice(bounds[i], bounds[j]) };
      sub.x0 = sub.clusters[0].x0; sub.x1 = sub.clusters[sub.clusters.length - 1].x1;
      sub.y0 = Math.min(...sub.clusters.map(c => c.y0)); sub.y1 = Math.max(...sub.clusters.map(c => c.y1));
      const local = (x, y) => glyphAt(x + a, y + a);
      const r = this.decoder.decode(sub, line, local);
      const out = { r, word: sub, glyphAt: local };
      memo.set(key, out);
      return out;
    };
    if (cuts.length === 0) return [part(0, 1)];
    // Best segmentation by dynamic programming over the boundaries.
    const n = bounds.length - 1;
    const best = Array(n + 1).fill(null);
    best[0] = { score: 0, parts: [] };
    for (let j = 1; j <= n; j++) {
      for (let i = 0; i < j; i++) {
        if (!best[i]) continue;
        const p = part(i, j);
        if (!p.r.text) continue;
        // A split costs more when the gap is small relative to the writing.
        const gap = i > 0 ? cuts[i - 1].g : 0;
        const cost = i > 0 ? Math.max(0.4, 3.6 - 5 * (gap / xh)) : 0;
        const s = best[i].score + p.r.score - cost;
        if (!best[j] || s > best[j].score) best[j] = { score: s, parts: [...best[i].parts, p] };
      }
    }
    return best[n] ? best[n].parts : [part(0, n)];
  }

  /**
   * Wrong ways to cut this word — two neighbouring letters taken together, or part of
   * a letter. If the teacher confirms the word, these become real "not a letter"
   * examples in her own hand (see CorrectionHarvester).
   */
  static negatives(spans, glyphAt, nPieces, max = 4) {
    const out = [];
    const add = (a, b) => {
      if (out.length >= max || a < 0 || b >= nPieces || b - a > 2) return;
      const g = glyphAt(a, b);
      if (g) out.push(g.pixels);
    };
    for (let i = 0; i + 1 < spans.length && out.length < max; i++) {
      const [a0, b0] = spans[i], [a1, b1] = spans[i + 1];
      add(a0, b1);                                   // two letters as one
      if (b0 > a0) add(b0, a1);                      // end of one letter + start of the next
      if (b1 > a1) add(a1, a1);                      // the first piece of a split letter
    }
    return out;
  }

  /** @param input {{rgba, width, height}} | {{gray: GrayImage}} */
  recognize(input, { quad, onProgress } = {}) {
    const gray = input.gray || GrayImage.fromRGBA(input.rgba, input.width, input.height);
    const ctx = this.preprocess(gray, { quad, onProgress });
    const comps = new Components(ctx.bin).clean();
    const lines = new LineSegmenter().segment(comps);
    const cutter = new CutPointFinder(comps.labels, ctx.bin.w);
    const words = new WordSegmenter(cutter);
    const out = [];
    lines.forEach((line, li) => {
      const lineWords = [];
      for (const w of words.segment(line)) {
        for (const sub of this.splitWord(w, line, comps.labels, ctx.bin.w)) {
          const { r, word: sw, glyphAt } = sub;
          if (!r.text) continue;
          lineWords.push({
            text: r.text, conf: r.conf, alts: r.alts,
            box: { x: sw.x0, y: sw.y0, w: sw.x1 - sw.x0 + 1, h: sw.y1 - sw.y0 + 1 },
            glyphs: r.spans.map(([a, b], i) => {
              const g = glyphAt(a, b);
              return { ch: r.text[i], box: g.box, px: g.pixels };
            }),
            negatives: OcrEngine.negatives(r.spans, glyphAt, sw.pieces.length)
          });
        }
      }
      if (lineWords.length) out.push({ n: li, words: lineWords });
      if (onProgress) onProgress({ stage: 'reading', done: li + 1, of: lines.length });
    });
    return {
      width: ctx.gray.w, height: ctx.gray.h, angle: ctx.angle || 0, quad: ctx.detectedQuad || null,
      page: ctx.gray, lines: out,
      text: out.map(l => l.words.map(w => w.text).join(' ')).join('\n')
    };
  }
}
