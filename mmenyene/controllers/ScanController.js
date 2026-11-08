// mmenyene/controllers/ScanController.js — snap → read → correct → save, and the
// teacher's handwriting model.
import fs from 'node:fs';
import { Controller } from '../../mme/http/Controller.js';

export class ScanController extends Controller {
  routes() {
    return [
      ['GET', '/api/ocr/info', 'info'],
      ['GET', '/api/ocr/model', 'model'],
      ['GET', '/api/ocr/lexicon', 'lexicon'],
      ['POST', '/api/ocr/train', 'train'],
      ['POST', '/api/scans', 'save'],
      ['GET', '/api/scans/:id/image', 'image'],
      ['POST', '/api/scans/:id/accept', 'accept']
    ];
  }

  get svc() { return this.app.scan; }

  info(req) { return this.svc.modelInfo(req.teacher); }

  model(req, res) {
    const buf = fs.readFileSync(this.svc.personalModelFile(req.teacher));
    res.send(200, buf, 'application/octet-stream', { 'Cache-Control': 'private, max-age=86400' });
  }

  lexicon(req, res) {
    const words = fs.existsSync(this.app.dataDir + '/lexicon/en.txt') ? fs.readFileSync(this.app.dataDir + '/lexicon/en.txt', 'utf8') : '';
    res.json(200, { words: words.split(/\r?\n/).filter(Boolean), notes: this.svc.lexiconText(req.teacher) });
  }

  train(req) { return this.svc.train(req.teacher); }
  async save(req) { const s = this.svc.saveScan(req.teacher, await req.json()); return { id: s.id }; }
  image(req, res) { res.send(200, fs.readFileSync(this.svc.imageFile(req.teacher, req.params.id)), 'image/jpeg', { 'Cache-Control': 'private, max-age=3600' }); }
  async accept(req) { return this.svc.accept(req.teacher, req.params.id, await req.json()); }
}
