import { EventBus } from './EventBus.js';

export class Socket {
  constructor(rawWs, id, nsp, handshake) {
    this.rawWs = rawWs;
    this.id = id;
    this.nsp = nsp; // Посилання на Namespace, якому належить сокет
    this.handshake = handshake;
    this.events = new EventBus();

    this.#initListeners();
  }

  on(event, callback) { this.events.on(event, callback); }

  emit(event, data) {
    if (this.rawWs.readyState === 1) {
      this.rawWs.send(JSON.stringify({ event, data }));
    }
  }

  join(roomName) {
    this.nsp.adapter.addAll(this, [roomName]);
  }

  leave(roomName) {
    this.nsp.adapter.del(this.id, roomName);
  }

  // Відправка повідомлення в кімнату (опціонально виключаючи себе)
  to(roomName) {
    return {
      emit: (event, data) => {
        this.nsp.adapter.broadcast(roomName, { event, data }, { except: this.id });
      }
    };
  }

  #initListeners() {
    this.rawWs.on('message', (message) => {
      try {
        const parsed = JSON.parse(message);
        if (parsed.event) this.events.emit(parsed.event, parsed.data);
      } catch (err) {
        console.error(`[Socket ${this.id}] Помилка JSON:`, err.message);
      }
    });

    this.rawWs.on('close', () => {
      this.nsp.adapter.delAll(this.id);
      this.events.emit('disconnect');
    });
  }
}
