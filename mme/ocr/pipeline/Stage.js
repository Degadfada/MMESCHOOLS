// mme/ocr/pipeline/Stage.js — one step of page preprocessing. Each stage reads and
// writes a shared context: { gray, bin, quad, angle, notes[] }.

export class Stage {
  get name() { return this.constructor.name; }
  // eslint-disable-next-line no-unused-vars
  run(ctx) { throw new Error(this.name + '.run() not implemented'); }
}

export class Pipeline {
  constructor(stages) { this.stages = stages; }
  run(ctx, onProgress) {
    this.stages.forEach((s, i) => {
      s.run(ctx);
      if (onProgress) onProgress({ stage: s.name, done: i + 1, of: this.stages.length });
    });
    return ctx;
  }
}
