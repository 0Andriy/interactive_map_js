import { EventBus } from './EventBus.js';

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

  on(event, callback) { 
    this.events.on(event, callback); 
  }

  emit(event, data, ackCallback = null) {
    if (this.rawWs.readyState !== 1) {
      this.logger.warn(`Спроба відправити еміт "${event}" у закритий сокет`, `Socket:${this.id}`);
      return;
    }
    
    const packet = { event, data };

    if (typeof ackCallback === 'function') {
      const ackId = ++this.ackCounter;
      this.ackCallbacks.set(ackId, ackCallback);
      packet.ackId = ackId;
    }

    if (this.isVolatile && this.rawWs.bufferedAmount > 0) {
      this.isVolatile = false;
      this.logger.debug(`Дропнуто volatile пакет "${event}" через забитий буфер`, `Socket:${this.id}`);
      return;
    }
    this.isVolatile = false;
    this.rawWs.send(JSON.stringify(packet));
  }

  get volatile() { 
    this.isVolatile = true; 
    return this; 
  }
  
  join(roomName) { 
    this.nsp.adapter.addAll(this, [roomName]); 
    this.events.emit('join', roomName);
  }
  
  leave(roomName) { 
    this.nsp.adapter.del(this.id, roomName); 
    this.events.emit('leave', roomName);
  }

  to(roomName) {
    const isVolatileCall = this.isVolatile;
    this.isVolatile = false;
    return {
      emit: (event, data) => {
        this.nsp.adapter.broadcast(roomName, { event, data }, { 
          except: this.id, 
          volatile: isVolatileCall 
        });
      }
    };
  }

  terminate() {
    this.logger.warn(`Примусове розірвання TCP з'єднання (terminate)`, `Socket:${this.id}`);
    this.rawWs.terminate();
  }

  #initListeners() {
    this.rawWs.on('pong', () => { 
      this.isAlive = true; 
    });

    this.rawWs.on('message', (message) => {
      try {
        const parsed = JSON.parse(message);
        this.events.emit('incoming_message', parsed);

        if (parsed.isAckResponse) {
          const cb = this.ackCallbacks.get(parsed.ackId);
          if (cb) { 
            cb(parsed.data); 
            this.ackCallbacks.delete(parsed.ackId); 
          }
          return;
        }
        
        if (parsed.event) {
          let respondFunc = null;
          if (parsed.ackId) {
            respondFunc = (resData) => {
              if (this.rawWs.readyState === 1) {
                this.rawWs.send(JSON.stringify({ 
                  isAckResponse: true, 
                  ackId: parsed.ackId, 
                  data: resData 
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
      this.logger.info(`Фізичне з'єднання закрилося (Код: ${code})`, `Socket:${this.id}`);
      
      const activeRoomsBeforeCleanup = new Set(this.rooms);
      this.events.emit('disconnecting', activeRoomsBeforeCleanup);
      this.nsp.globalEvents.emit('disconnecting', { socket: this, rooms: activeRoomsBeforeCleanup });

      this.nsp.adapter.delAll(this.id, this.nsp.serverOptions.gracePeriodMs, () => {
        this.logger.info(`Остаточне очищення сокета завершено після періоду грації`, `Socket:${this.id}`);
        this.events.emit('disconnect', { code, reason });
      });
    });
  }
}
