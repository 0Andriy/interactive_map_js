export class EventBus {
  constructor() { this.listeners = new Map(); }
  on(event, callback) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(callback);
  }
  emit(event, ...args) {
    if (!this.listeners.has(event)) return;
    for (const cb of this.listeners.get(event)) cb(...args);
  }
  off(event) { this.listeners.delete(event); }
}
