export class Namespace {
  constructor(name, adapterInstance, serverOptions, logger) {
    this.name = name;
    this.adapter = adapterInstance;
    this.serverOptions = serverOptions;
    this.logger = logger; // DI
    this.middlewares = [];
    this.globalEvents = new EventBus();
    this.sockets = new Map();
  }

  use(fn) { this.middlewares.push(fn); return this; }
  on(event, callback) { this.globalEvents.on(event, callback); }

  addSocket(socket) {
    this.logger.debug(`Запуск middleware для сокета ${socket.id}`, `Namespace:${this.name}`);
    this.runMiddlewares(socket, (err) => {
      if (err) {
        this.logger.warn(`Middleware відхилив сокет ${socket.id}. Причина: ${err.message}`, `Namespace:${this.name}`);
        socket.emit('connect_error', err.message);
        socket.rawWs.close();
        return;
      }
      this.sockets.set(socket.id, socket);
      socket.join(socket.id);
      this.logger.info(`Сокет ${socket.id} успішно пройшов авторизацію та підключився`, `Namespace:${this.name}`);
      this.globalEvents.emit('connection', socket);

      socket.on('disconnect', () => {
        this.sockets.delete(socket.id);
        this.logger.debug(`Сокет ${socket.id} видалено зі списку активних`, `Namespace:${this.name}`);
        this.globalEvents.emit('disconnect', socket);
      });
    });
  }
  // ... runMiddlewares без змін ...
}
