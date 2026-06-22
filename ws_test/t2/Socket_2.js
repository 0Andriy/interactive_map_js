import { EventBus } from './EventBus.js';

export class Socket {
  constructor(rawWs, id, nsp, handshake) {
    this.rawWs = rawWs;
    this.id = id;
    this.nsp = nsp;
    this.handshake = handshake;
    this.events = new EventBus();
    
    this.isVolatile = false; // Стан для поточного ланцюжка викликів
    this.ackCallbacks = new Map(); // Зберігання очікуючих колбеків ackId -> callback
    this.ackCounter = 0;

    this.#initListeners();
  }

  on(event, callback) { this.events.on(event, callback); }

  // Модифікований emit з підтримкою Acknowledgement
  emit(event, data, ackCallback = null) {
    if (this.rawWs.readyState !== 1) return;

    const packet = { event, data };

    // Якщо передано колбек, реєструємо його та генеруємо ackId
    if (typeof ackCallback === 'function') {
      const ackId = ++this.ackCounter;
      this.ackCallbacks.set(ackId, ackCallback);
      packet.ackId = ackId;
    }

    // Фіча Volatile: перевірка завантаженості буфера
    if (this.isVolatile && this.rawWs.bufferedAmount > 0) {
      this.isVolatile = false; // скидаємо прапорець
      return; 
    }
    this.isVolatile = false; // скидаємо прапорець

    this.rawWs.send(JSON.stringify(packet));
  }

  // Ввімкнення режиму volatile для НАСТУПНОГО еміту (ланцюжковий виклик як в socket.io)
  get volatile() {
    this.isVolatile = true;
    return this;
  }

  join(roomName) { this.nsp.adapter.addAll(this, [roomName]); }
  leave(roomName) { this.nsp.adapter.del(this.id, roomName); }

  // Модифікований метод відправки в кімнату з підтримкою флага volatile
  to(roomName) {
    const isVolatileCall = this.isVolatile;
    this.isVolatile = false; // Одразу скидаємо глобальний прапорець сокета

    return {
      emit: (event, data) => {
        this.nsp.adapter.broadcast(roomName, { event, data }, { 
          except: this.id,
          volatile: isVolatileCall 
        });
      }
    };
  }

  #initListeners() {
    this.rawWs.on('message', (message) => {
      try {
        const parsed = JSON.parse(message);

        // 1. Оробка системної відповіді на наш Acknowledgement
        if (parsed.isAckResponse) {
          const callback = this.ackCallbacks.get(parsed.ackId);
          if (callback) {
            callback(parsed.data);
            this.ackCallbacks.delete(parsed.ackId);
          }
          return;
        }

        // 2. Обробка звичайної події
        if (parsed.event) {
          // Створюємо функцію відповіді, якщо клієнт попросив підтвердження
          let respondFunc = null;
          if (parsed.ackId) {
            respondFunc = (responseData) => {
              if (this.rawWs.readyState === 1) {
                this.rawWs.send(JSON.stringify({
                  isAckResponse: true,
                  ackId: parsed.ackId,
                  data: responseData
                }));
              }
            };
          }

          // Передаємо дані та функцію відповіді в шину подій
          this.events.emit(parsed.event, parsed.data, respondFunc);
        }
      } catch (err) {
        console.error(`[Socket ${this.id}] Помилка:`, err.message);
      }
    });

    this.rawWs.on('close', () => {
      this.nsp.adapter.delAll(this.id);
      this.events.emit('disconnect');
    });
  }
}
