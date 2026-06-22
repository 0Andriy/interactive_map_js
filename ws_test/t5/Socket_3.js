import { EventBus } from './EventBus.js';
import { BroadcastOperator } from './BroadcastOperator.js';

export class Socket {
  constructor(rawWs, id, nsp, handshake, logger) {
    this.rawWs = rawWs;
    this.id = id;
    this.nsp = nsp;
    this.handshake = handshake;
    this.logger = logger;
    
    this.events = new EventBus();
    this.isAlive = true;
    this.isVolatile = false;
    this.ackCallbacks = new Map();
    this.ackCounter = 0;

    this.#initListeners();
  }

  get rooms() {
    return this.nsp.adapter.sids.get(this.id) || new Set();
  }

  on(event, callback) { this.events.on(event, callback); }

  // Еміт ОДНОМУ конкретному клієнту
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

  // ФІЧА: socket.broadcast — повертає оператор розсилки всім, КРІМ себе
  get broadcast() {
    return new BroadcastOperator(this.nsp.adapter, this.id);
  }

  // Chaining .volatile для сокета
  get volatile() {
    const operator = new BroadcastOperator(this.nsp.adapter, this.id);
    return operator.volatile;
  }

  // Chaining .to() для сокета (надсилає іншим в кімнату)
  to(roomName) {
    const operator = new BroadcastOperator(this.nsp.adapter, this.id);
    return operator.to(roomName);
  }

  in(roomName) { return this.to(roomName); }

  join(roomName) { this.nsp.adapter.addAll(this, [roomName]); }
  leave(roomName) { this.nsp.adapter.del(this.id, roomName); }
  terminate() { this.rawWs.terminate(); }

  #initListeners() {
    this.rawWs.on('pong', () => { this.isAlive = true; });

    // packet, rawData (rawMessage), replyTo
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
      const activeRoomsBeforeCleanup = new Set(this.rooms);
      this.events.emit('disconnecting', activeRoomsBeforeCleanup);
      this.nsp.globalEvents.emit('disconnecting', { socket: this, rooms: activeRoomsBeforeCleanup });

      this.nsp.adapter.delAll(this.id, this.nsp.serverOptions.gracePeriodMs, () => {
        this.events.emit('disconnect', { code, reason });
      });
    });
  }
}
