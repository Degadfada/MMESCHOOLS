// mmenyene/snap/trainWorker.js — fine-tune one teacher's model, off the main thread.
import fs from 'node:fs';
import { parentPort, workerData } from 'node:worker_threads';
import { Network } from '../../mme/ocr/nn/Network.js';
import { Trainer } from '../../mme/ocr/nn/Trainer.js';
import { classOf } from '../../mme/ocr/Charset.js';
import { Glyph } from '../../mme/ocr/layout/Glyph.js';
import { ReplaySet } from '../../mme/ocr/learn/ReplaySet.js';
import { PersonalTrainer } from '../../mme/ocr/learn/PersonalTrainer.js';

const { startFrom, replay, out, samples } = workerData;
let seed = 99;
const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

const mine = samples.map(s => ({ px: Glyph.fromBytes(new Uint8Array(s.glyph)), y: classOf(s.label), holdout: s.holdout })).filter(s => s.y >= 0);
const train = mine.filter(s => !s.holdout), test = mine.filter(s => s.holdout);
const before = Network.deserialize(fs.readFileSync(startFrom));
const accBefore = test.length >= 5 ? Trainer.evaluate(before, test).acc : null;

const net = before.clone();
const replaySet = fs.existsSync(replay) ? ReplaySet.read(fs.readFileSync(replay)) : [];
new PersonalTrainer({ rng }).train(net, train, replaySet, (p) => parentPort.postMessage({ type: 'progress', progress: p }));

const accAfter = test.length >= 5 ? Trainer.evaluate(net, test).acc : Trainer.evaluate(net, train).acc;
net.meta = { ...net.meta, personal: true, trained: new Date().toISOString(), samples: mine.length };
fs.writeFileSync(out, net.serialize());
parentPort.postMessage({ type: 'done', accBefore, accAfter, holdout: test.length });
