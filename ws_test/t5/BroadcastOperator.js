export class BroadcastOperator {
  /**
   * @param {Object} adapter - Адаптер простору назв
   * @param {string} [exceptSocketId] - ID сокета, який треба ігнорувати (опціонально)
   */
  constructor(adapter, exceptSocketId = null) {
    this.adapter = adapter;
    this.exceptSocketId = exceptSocketId;
    this.rooms = new Set();
    this.isVolatile = false;
  }

  // Додавання кімнати в ланцюжок
  to(roomName) {
    this.rooms.add(roomName);
    return this;
  }

  // Аліас для .to()
  in(roomName) {
    return this.to(roomName);
  }

  // Прапорець volatile для поточного ланцюжка
  get volatile() {
    this.isVolatile = true;
    return this;
  }

  // ФІЧА: Дозволяє додавати таймаут для Ack розсилок
  timeout(ms) {
    this.ackTimeoutMs = ms;
    return this;
  }

  emit(event, data, ackCallback = null) {
    const packet = { event, data };

    // Звичайний бродкаст не підтримує Ack-колбеки на рівні всього кластера, 
    // оскільки відповідь має прийти від багатьох людей. Проте, якщо передано таймаут,
    // ми прокинемо його як опцію в адаптер (для майбутнього розширення).
    const opts = {
      except: this.exceptSocketId,
      volatile: this.isVolatile,
      timeoutMs: this.ackTimeoutMs
    };

    if (this.rooms.size === 0) {
      this.adapter.broadcast(null, packet, opts);
      return;
    }

    for (const roomName of this.rooms) {
      this.adapter.broadcast(roomName, packet, opts);
    }
  }

  // Фінальний еміт розсилки
  emit(event, data) {
    const packet = { event, data };

    // Якщо .to() або .in() не викликалися, робимо бродкаст на ВЕСЬ неймспейс (всі сокети)
    if (this.rooms.size === 0) {
      // Для бродкасту на весь неймспейс в адаптерах ми можемо використовувати зарезервовану назву або пустий рядок,
      // але правильніше пройтися по всіх зареєстрованих кімнатах адаптера
      const allRooms = Array.from(this.adapter.rooms.keys());
      
      // Якщо кімнат взагалі немає, відправляємо хоча б локальним сокетам, що підключені прямо зараз
      if (allRooms.length === 0 && typeof this.adapter.localBroadcast === 'function') {
        // Якщо адаптер має прямий список сокетів (як у нашому InMemory/Redis)
        for (const [socketId, socket] of this.adapter.sids.entries()) {
          if (socketId === this.exceptSocketId) continue;
          // Знаходимо об'єкт сокета (він лежить в картах кімнат)
          // Для спрощення: бродкаст без кімнат робиться через виклик спеціального методу адаптера
        }
      }

      // Натомість Socket.IO використовує глобальний бродкаст. 
      // Додамо підтримку: якщо rooms пустий, адаптер надсилає усім.
      this.adapter.broadcast(null, packet, {
        except: this.exceptSocketId,
        volatile: this.isVolatile
      });
      return;
    }

    // Якщо кімнати вказані — шлемо точково по них
    for (const roomName of this.rooms) {
      this.adapter.broadcast(roomName, packet, {
        except: this.exceptSocketId,
        volatile: this.isVolatile
      });
    }
  }
}
