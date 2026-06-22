import { EventBus } from './EventBus.js';

// Допоміжний клас-модифікатор для реалізації патерну "Ланцюжок викликів" (Chaining)
class BroadcastOperator {
  constructor(socket) {
    this.socket = socket;
    this.rooms = new Set();
    this.isVolatile = false;
  }

  // Додавання кімнати в ланцюжок. Повертає сам себе (this), дозволяючи викликати .to() знову
  to(roomName) {
    this.rooms.add(roomName);
    return this;
  }

  // Аліас для .to() як в оригінальному socket.io
  in(roomName) {
    return this.to(roomName);
  }

  // Можливість увімкнути volatile прямо всередині ланцюжка після .to()
  get volatile() {
    this.isVolatile = true;
    return this;
  }

  // Фінальний метод ланцюжка, який виконує реальну розсилку
  emit(event, data) {
    // Якщо кімнат не вказано, оригінальний Socket.IO нікуди не відправляє,
    // або ми можемо зробити бродкаст на весь неймспейс. За замовчуванням пройдемо по вказаних кімнатах:
    for (const roomName of this.rooms) {
      this.socket.nsp.adapter.broadcast(roomName, { event, data }, {
        except: this.socket.id, // Ігноруємо відправника
        volatile: this.isVolatile || this.socket.isVolatile
      });
    }
    
    // Скидаємо прапорці на самому сокеті після завершення операції
    this.socket.isVolatile = false;
  }
}

export class Socket {
  constructor(rawWs, id, nsp, handshake, logger) {
    this.rawWs = rawWs;
    this.id = id;
    this.nsp = nsp;
    this.handshake = handshake;
    this.logger = logger;
    
    this.events = new EventBus();
    this.isAlive = true;
    this.isVolatile = false; // Глобальний прапорець для сокета
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

  // Звичайний еміт ОДНОМУ конкретному клієнту
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

  // Геттер .volatile — ініціює ланцюжок або прапорець для сокета
  get volatile() {
    this.isVolatile = true;
    // Повертаємо новий оператор ланцюжка викликів, щоб можна було писати: socket.volatile.to('room').emit()
    return new BroadcastOperator(this).volatile;
  }

  // Метод .to() — створює новий оператор ланцюжка і додає туди першу кімнату
  to(roomName) {
    const operator = new BroadcastOperator(this);
    if (this.isVolatile) {
      operator.volatile;
      this.isVolatile = false; // Переносимо прапорець в оператор і скидаємо на сокеті
    }
    return operator.to(roomName);
  }

  // Аліас для .to()
  in(roomName) {
    return this.to(roomName);
  }

  join(roomName) { 
    this.nsp.adapter.addAll(this, [roomName]); 
    this.events.emit('join', roomName);
  }

  leave(roomName) { 
    this.nsp.adapter.del(this.id, roomName); 
    this.events.emit('leave', roomName);
  }

  terminate() {
    this.logger.warn(`Примусове розірвання TCP з'єднання (terminate)`, `Socket:${this.id}`);
    this.rawWs.terminate();
  }

  #initListeners() {
    this.rawWs.on('pong', () => { this.isAlive = true; });

    this.rawWs.on('message', (message) => {
      this.logger.debug(`Отримано сире повідомлення з мережі`, `Socket:${this.id}`);
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
      } catch (err) { this.logger.error(`Помилка парсингу: ${err.message}`, `Socket:${this.id}`); }
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
