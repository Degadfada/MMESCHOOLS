// launch.js — one-click start: the server plus the built-in Cloudflare tunnel.
// Double-click start.bat (Windows) or run `npm start`.
import path from 'node:path';
import os from 'node:os';
import { App, ROOT } from './mme/App.js';
import { CloudflareTunnel } from './mme/net/CloudflareTunnel.js';

const port = Number(process.env.PORT) || 5080;
const app = await new App({ port }).start();
const tunnel = new CloudflareTunnel({ port, binDir: path.join(ROOT, 'bin') });
app.attachTunnel(tunnel);

const lan = Object.values(os.networkInterfaces()).flat().filter(a => a && a.family === 'IPv4' && !a.internal).map(a => `http://${a.address}:${port}`);
const line = '='.repeat(70);
console.log(`\n${line}\n   MMESCHOOLS — running\n${line}`);
console.log(`   On this computer        :  http://localhost:${port}`);
for (const l of lan) console.log(`   Same Wi-Fi / hotspot    :  ${l}`);
console.log('   Starting the public link (Cloudflare)… it appears in a few seconds.\n');

tunnel.on('url', (url) => {
  console.log(`${line}\n   PUBLIC LINK (phones anywhere):  ${url}\n`);
  console.log(`   Teachers sign in at      :  ${url}/`);
  console.log(`   Students open            :  ${url}/t/<TEST CODE>`);
  console.log('   The link changes each time this window starts; the test codes do not.');
  console.log(`   Keep this window open. Close it to stop everything.\n${line}\n`);
});
tunnel.on('error', (e) => console.log(`   No public link: ${e.message}\n   Everything still works on this computer and the same Wi-Fi.`));
tunnel.start();

const stop = async () => { console.log('\nStopping…'); await app.stop(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
