import { EventBus } from './EventBus.js';

export class Namespace {
  constructor(name, AdapterClass) {
    this.name = name;
    this.adapter = new AdapterClass(name); // DI: ініціалізація адаптера для цього nsp
    this.middlewares = [];
    this.globalEvents = new EventBus();
    this.sockets = new Map(); // Активні сокети саме в цьому неймспейсі
  }

  // Реєстрація Middleware (функція приймає socket та функцію next)
  use(fn) {
    this.middlewares.push(fn);
    return this;
  }

  on(event, callback) {
    this.globalEvents.on(event, callback);
  }

  // Проганяємо сокет через ланцюжок middleware (аналог механізму в Express/Socket.io)
  runMiddlewares(socket, callback) {
    let index = 0;
    const next = (err) => {
      if (err) return callback(err);
      if (index >= this.middlewares.length) return callback(null);
      
      const middleware = this.middlewares[index++];
      try {
        middleware(socket, next);
      } catch (e) {
        callback(e);
      }
    };
    next();
  }

  addSocket(socket) {
    this.runMiddlewares(socket, (err) => {
      if (err) {
        console.error(`[Nsp ${this.name}] Відхилено з'єднання:`, err.message);
        socket.emit('connect_error', err.message);
        socket.rawWs.close(); // Закриваємо фізичне з'єднання
        return;
      }

      // Якщо перевірку пройдено — додаємо користувача в систему
      this.sockets.set(socket.id, socket);
      
      // Кожен сокет за замовчуванням заходить у кімнату зі своїм власному ID
      socket.join(socket.id);

      // Викликаємо подію підключення для бізнес-коду
      this.globalEvents.emit('connection', socket);

      socket.on('disconnect', () => {
        this.sockets.delete(socket.id);
      });
    });
  }

  // Еміт усім клієнтам у цьому неймспейсі
  emitToAll(event, data) {
    const payload = JSON.stringify({ event, data });
    for (const socket of this.sockets.values()) {
      if (socket.rawWs.readyState === 1) socket.rawWs.send(payload);
    }
  }
}
