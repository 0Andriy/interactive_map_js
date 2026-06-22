import { EventBus } from './EventBus.js';

export class Socket {
  constructor(rawWs, id, roomManager) {
    this.rawWs = rawWs;
    this.id = id;
    this.roomManager = roomManager; // Впровадження залежності (DI)
    this.events = new EventBus();

    this.#initListeners();
  }

  // Публічний API для підписки на події сокета (аналог socket.on)
  on(event, callback) {
    this.events.on(event, callback);
  }

  // Відправка події конкретному клієнту (аналог socket.emit)
  emit(event, data) {
    if (this.rawWs.readyState === 1) { // 1 === OPEN
      this.rawWs.send(JSON.stringify({ event, data }));
    }
  }

  // Вхід у кімнату (аналог socket.join)
  join(roomName) {
    this.roomManager.joinRoom(roomName, this);
  }

  // Вихід з кімнати (аналог socket.leave)
  leave(roomName) {
    this.roomManager.leaveRoom(roomName, this.id);
  }

  // Відправка повідомлення всім у кімнаті, крім себе (аналог socket.broadcast.to)
  broadcastTo(roomName, event, data) {
    this.roomManager.broadcastToRoom(roomName, event, data, this.id);
  }

  #initListeners() {
    this.rawWs.on('message', (message) => {
      try {
        const parsed = JSON.parse(message);
        if (parsed.event) {
          // Тригеримо подію на рівні цього конкретного сокета
          this.events.emit(parsed.event, parsed.data);
        }
      } catch (err) {
        console.error(`[Socket ${this.id}] Помилка парсингу JSON:`, err.message);
      }
    });

    this.rawWs.on('close', () => {
      this.roomManager.clearSocketFromRooms(this.id);
      this.events.emit('disconnect');
    });
  }
}
