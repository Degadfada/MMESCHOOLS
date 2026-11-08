// web/teacher/View.js — base for every screen: holds the app, cleans up timers.
export class View {
  constructor(app, params = {}) { this.app = app; this.params = params; this.timers = []; }
  every(ms, fn) { this.timers.push(setInterval(fn, ms)); }
  destroy() { this.timers.forEach(clearInterval); if (this.onDestroy) this.onDestroy(); }
}
