import { WebSocketServer } from 'ws';
import { Socket } from './Socket.js';
import { EventBus } from './EventBus.js';

export class IoServer {
  // Через конструктор впроваджуємо залежаний RoomManager (DI)
  constructor(roomManager) {
    this.roomManager = roomManager;
    this.globalEvents = new EventBus();
    this.sockets = new Map(); // Глобальний список активних сокетів (RAM)
    this.wss = null;
  }

  // Метод ініціалізації (аналог io.attach() або new Server(httpServer))
  attach(httpServer) {
    this.wss = new WebSocketServer({ server: httpServer });

    this.wss.on('connection', (rawWs) => {
      const socketId = `id_${Math.random().toString(36).substring(2, 11)}`;
      
      // Створюємо нашу обгортку сокета та інжектуємо туди roomManager
      const socket = new Socket(rawWs, socketId, this.roomManager);
      this.sockets.set(socketId, socket);

      console.log(`[IoServer] Нове підключення. Згенеровано ID: ${socketId}`);

      // Тригеримо глобальну подію сервера 'connection'
      this.globalEvents.emit('connection', socket);

      // Видаляємо з глобального списку при відключенні
      socket.on('disconnect', () => {
        this.sockets.delete(socketId);
        console.log(`[IoServer] Клієнт ${socketId} повністю відключився.`);
      });
    });
  }

  // Реєстрація глобальних подій сервера (наприклад io.on('connection'))
  on(event, callback) {
    this.globalEvents.on(event, callback);
  }

  // Відправити ВСІМ підключеним клієнтам (аналог io.emit)
  emitToAll(event, data) {
    for (const socket of this.sockets.values()) {
      socket.emit(event, data);
    }
  }
}
