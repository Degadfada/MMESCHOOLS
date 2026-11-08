// mmenyene/controllers/SystemController.js — tunnel status, local links, QR images, backup.
import os from 'node:os';
import path from 'node:path';
import { Controller } from '../../mme/http/Controller.js';
import { QrCode } from '../../mme/net/QrCode.js';

export class SystemController extends Controller {
  routes() {
    return [
      ['GET', '/api/system', 'system'],
      ['GET', '/api/qr', 'qr', { auth: 'public' }],
      ['POST', '/api/system/backup', 'backup', { auth: 'owner' }]
    ];
  }

  system() {
    const lan = [];
    for (const list of Object.values(os.networkInterfaces())) {
      for (const a of list || []) if (a.family === 'IPv4' && !a.internal) lan.push(`http://${a.address}:${this.app.port}`);
    }
    return { tunnel: this.app.tunnel ? this.app.tunnel.info() : { status: 'off', url: null }, local: `http://localhost:${this.app.port}`, lan };
  }

  qr(req, res) {
    const text = String(req.query.text || '').slice(0, 300);
    if (!text) return res.send(400, 'text required');
    res.send(200, QrCode.encode(text).toSvg(), 'image/svg+xml; charset=utf-8', { 'Cache-Control': 'public, max-age=600' });
  }

  backup() {
    const file = path.join(this.app.dataDir, 'backups', `mmeschools-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
    this.app.db.backup(file);
    return { file };
  }
}
