// mme/events/EventBus.js — the in-process publish/subscribe spine.
import { EventEmitter } from 'node:events';

export class EventBus extends EventEmitter {
  constructor() { super(); this.setMaxListeners(0); }
  publish(topic, event) { this.emit(topic, { ...event, at: event.at || Date.now() }); }
  subscribe(topic, fn) { this.on(topic, fn); return () => this.off(topic, fn); }
}
