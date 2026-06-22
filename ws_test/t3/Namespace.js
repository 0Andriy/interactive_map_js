import { EventBus } from './EventBus.js';

export class Namespace {
  constructor(name, adapterInstance) {
    this.name = name;
    this.adapter = adapterInstance; // Інжектований готовий інстанс адаптера
    this.middlewares = [];
    this.globalEvents = new EventBus();
    this.sockets = new Map();
  }

  use(fn) { this.middlewares.push(fn); return this; }
  on(event, callback) { this.globalEvents.on(event, callback); }

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

  addSocket(socket) {
    this.globalEvents.emit('before_connect', socket); // Подія ЖЦ Неймспейсу

    this.runMiddlewares(socket, (err) => {
      if (err) {
        this.globalEvents.emit('connect_error', { socket, error: err }); // Подія ЖЦ Неймспейсу
        socket.emit('connect_error', err.message);
        socket.rawWs.close();
        return;
      }

      this.sockets.set(socket.id, socket);
      socket.join(socket.id);

      this.globalEvents.emit('connection', socket);

      socket.on('disconnect', (ctx) => {
        this.sockets.delete(socket.id);
        this.globalEvents.emit('disconnect', { socket, ...ctx }); // Подія ЖЦ Неймспейсу
      });
    });
  }
}
