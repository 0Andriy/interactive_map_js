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
      this.events.emit('packet_dropped', packet); // Подія ЖЦ: Пакет дропнуто (volatile)
      return;
    }
    this.isVolatile = false;

    this.rawWs.send(JSON.stringify(packet));
  }

  get volatile() { this.isVolatile = true; return this; }

  join(roomName) {
    this.nsp.adapter.addAll(this, [roomName]);
    this.events.emit('join', roomName); // Подія ЖЦ сокета
  }

  leave(roomName) {
    this.nsp.adapter.del(this.id, roomName);
    this.events.emit('leave', roomName); // Подія ЖЦ сокета
  }

  to(roomName) {
    const isVolatileCall = this.isVolatile;
    this.isVolatile = false;
    return {
      emit: (event, data) => {
        this.nsp.adapter.broadcast(roomName, { event, data }, { 
          except: this.id, volatile: isVolatileCall 
        });
      }
    };
  }

  #initListeners() {
    this.rawWs.on('message', (message) => {
      try {
        const parsed = JSON.parse(message);
        
        // Подія ЖЦ: отримано сире повідомлення
        this.events.emit('incoming_message', parsed);

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
                this.rawWs.send(JSON.stringify({
                  isAckResponse: true, ackId: parsed.ackId, data: resData
                }));
              }
            };
          }
          this.events.emit(parsed.event, parsed.data, respondFunc);
        }
      } catch (err) {
        this.events.emit('error', err);
      }
    });

    this.rawWs.on('close', (code, reason) => {
      this.nsp.adapter.delAll(this.id);
      this.events.emit('disconnect', { code, reason }); // Подія ЖЦ з деталями закриття
    });
  }
}
