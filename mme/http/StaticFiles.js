// mme/http/StaticFiles.js — serve files from mounted folders, never outside them.
import fs from 'node:fs';
import path from 'node:path';

export const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.bin': 'application/octet-stream', '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json'
};

export class StaticFiles {
  constructor() { this.mounts = []; }

  mount(prefix, dir) { this.mounts.push({ prefix, dir: path.resolve(dir) }); return this; }

  resolve(urlPath) {
    for (const { prefix, dir } of this.mounts) {
      if (!urlPath.startsWith(prefix)) continue;
      let rel = urlPath.slice(prefix.length) || 'index.html';
      if (rel.endsWith('/')) rel += 'index.html';
      const file = path.resolve(dir, '.' + path.sep + rel);
      if (!file.startsWith(dir + path.sep) && file !== dir) continue;
      if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
    }
    return null;
  }

  serve(res, file, status = 200) {
    const ext = path.extname(file).toLowerCase();
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(status, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        // Code changes often during a term; models and images do not.
        'Cache-Control': (ext === '.bin' || ext === '.png' || ext === '.jpg') ? 'public, max-age=3600' : 'no-cache'
      });
      res.end(buf);
    });
  }
}
