// mme/events/LiveChannel.js — push live updates to watchers.
//
// Two transports, one channel. Server-Sent Events are tried first; Cloudflare quick
// tunnels buffer SSE (learned on the IDA Tech cert app), so every channel also keeps
// a revision number and pages poll `?since=rev` as a fallback. Pages use whichever
// delivers first.

export class LiveChannel {
  constructor(name) {
    this.name = name;
    this.rev = 0;
    this.clients = new Set();
    this.recent = [];             // last N events, for pollers
  }

  push(event) {
    const evt = { ...event, rev: ++this.rev };
    this.recent.push(evt);
    if (this.recent.length > 300) this.recent.shift();
    const line = `id: ${evt.rev}\ndata: ${JSON.stringify(evt)}\n\n`;
    for (const res of this.clients) { try { res.write(line); } catch { this.clients.delete(res); } }
    return evt;
  }

  since(rev) { return this.recent.filter(e => e.rev > rev); }

  attach(rawReq, rawRes) {
    rawRes.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    rawRes.write(`retry: 3000\ndata: ${JSON.stringify({ type: 'hello', rev: this.rev })}\n\n`);
    this.clients.add(rawRes);
    const ping = setInterval(() => { try { rawRes.write(': ping\n\n'); } catch { /* closed */ } }, 15000);
    rawReq.on('close', () => { clearInterval(ping); this.clients.delete(rawRes); });
  }
}

export class LiveHub {
  constructor() { this.channels = new Map(); }
  channel(name) {
    let c = this.channels.get(name);
    if (!c) { c = new LiveChannel(name); this.channels.set(name, c); }
    return c;
  }
}
