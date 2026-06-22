import { EventBus } from './EventBus.js';
import { BroadcastOperator } from './BroadcastOperator.js';

export class Namespace {
  constructor(name, adapterInstance, serverOptions, logger) {
    this.name = name;
    this.adapter = adapterInstance;
    this.serverOptions = serverOptions;
    this.logger = logger;
    this.middlewares = [];
    this.globalEvents = new EventBus();
    this.sockets = new Map();
  }

  use(fn) { this.middlewares.push(fn); return this; }
  on(event, callback) { this.globalEvents.on(event, callback); }

  // ФІЧА: Глобальний еміт з рівня Неймспейсу (всім-всім у цьому nsp)
  emit(event, data) {
    return new BroadcastOperator(this.adapter).emit(event, data);
  }

  // ФІЧА: Розсилка в кімнати з рівня Неймспейсу (наприклад chatNsp.to('vip').emit())
  to(roomName) {
    return new BroadcastOperator(this.adapter).to(roomName);
  }

  in(roomName) {
    return this.to(roomName);
  }

  addSocket(socket) {
    this.runMiddlewares(socket, (err) => {
      if (err) {
        socket.emit('connect_error', err.message);
        socket.rawWs.close();
        return;
      }
      this.sockets.set(socket.id, socket);
      
      // АВТОМАТИЧНЕ СТВОРЕННЯ ІНДИВІДУАЛЬНОЇ КІМНАТИ (socket.id є назвою кімнати)
      socket.join(socket.id);

      this.globalEvents.emit('connection', socket);

      socket.on('disconnect', () => {
        this.sockets.delete(socket.id);
        this.globalEvents.emit('disconnect', socket);
      });
    });
  }

  runMiddlewares(socket, callback) {
    let index = 0;
    const next = (err) => {
      if (err) return callback(err);
      if (index >= this.middlewares.length) return callback(null);
      const middleware = this.middlewares[index++];
      try { middleware(socket, next); } catch (e) { callback(e); }
    };
    next();
  }

  close() {
    this.logger.info(`Коректне закриття простору назв. Кількість сокетів: ${this.sockets.size}`, `Namespace:${this.name}`);
    
    // Використовуємо наш новий механізм бродкасту на весь nsp
    this.emit('server_shutdown', { message: 'Сервер іде на перезавантаження. Будь ласка, зачекайте.' });

    for (const socket of this.sockets.values()) {
      this.serverOptions.gracePeriodMs = 0; 
      socket.rawWs.close(1012, 'Server shutting down');
    }
    this.sockets.clear();
  }
}
