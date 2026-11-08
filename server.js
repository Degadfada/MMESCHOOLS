// server.js — run MMESCHOOLS on this computer only (no public link).
//   node server.js        → http://localhost:5080
import { App } from './mme/App.js';

const port = Number(process.env.PORT) || 5080;
const app = await new App({ port }).start();
console.log(`MMESCHOOLS is running on http://localhost:${port}`);
process.on('SIGINT', async () => { await app.stop(); process.exit(0); });
