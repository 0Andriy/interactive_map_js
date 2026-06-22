import { EventBus } from './EventBus.js';

export class Socket {
  constructor(rawWs, id, nsp, handshake) {
    this.rawWs = rawWs;
    this.id = id;
    this.nsp = nsp;
    this.handshake = handshake;
    this.events = new EventBus();
    
    this.isVolatile = false;
    this.ackCallbacks = new Map();
    this.ackCounter = 0;

    this.#initListeners();
  }

  // Повертає Set поточних кімнат сокета (аналог в socket.io)
  get rooms() {
    return this.nsp.adapter.sids.get(this.id) || new Set();
  }

  on(event, callback) { this.events.on(event, callback); }

  emit(event, data, ackCallback = null) {
    if (this.rawWs.readyState !== 1) return;
    const packet = { event, data };

    if (typeof ackCallback === 'function') {
      const ackId = ++this.ackCounter;
      this.ackCallbacks.set(ackId, ackCallback);
      packet.ackId = ackId;
    }

    if (this.isVolatile && this.rawWs.bufferedAmount > 0) {
      this.isVolatile = false;
      return;
    }
    this.isVolatile = false;
    this.rawWs.send(JSON.stringify(packet));
  }

  get volatile() { this.isVolatile = true; return this; }
  join(roomName) { this.nsp.adapter.addAll(this, [roomName]); }
  leave(roomName) { this.nsp.adapter.del(this.id, roomName); }

  to(roomName) {
    const isVolatileCall = this.isVolatile;
    this.isVolatile = false;
    return {
      emit: (event, data) => {
        this.nsp.adapter.broadcast(roomName, { event, data }, { except: this.id, volatile: isVolatileCall });
      }
    };
  }

  #initListeners() {
    this.rawWs.on('message', (message) => {
      try {
        const parsed = JSON.parse(message);
        if (parsed.isAckResponse) {
          const cb = this.ackCallbacks.get(parsed.ackId);
          if (cb) { cb(parsed.data); this.ackCallbacks.delete(parsed.ackId); }
          return;
        }
        if (parsed.event) {
          let respondFunc = null;
          if (parsed.ackId) {
            respondFunc = (resData) => {
              if (this.rawWs.readyState === 1) {
                this.rawWs.send(JSON.stringify({ isAckResponse: true, ackId: parsed.ackId, data: resData }));
              }
            };
          }
          this.events.emit(parsed.event, parsed.data, respondFunc);
        }
      } catch (err) { console.error(err); }
    });

    this.rawWs.on('close', (code, reason) => {
      // 1. ВИКЛИКАЄМО ІВЕНТ DISCONNECTING (Кімнати ще існують!)
      const activeRoomsBeforeCleanup = new Set(this.rooms);
      this.events.emit('disconnecting', activeRoomsBeforeCleanup);
      this.nsp.globalEvents.emit('disconnecting', { socket: this, rooms: activeRoomsBeforeCleanup });

      // 2. Очищення кімнат через адаптер з урахуванням grace-періоду налаштованого на сервері
      this.nsp.adapter.delAll(this.id, this.nsp.serverOptions.gracePeriodMs, () => {
        // Коли час вийшов — тригеримо остаточний disconnect
        this.events.emit('disconnect', { code, reason });
      });
    });
  }
}
