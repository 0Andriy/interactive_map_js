import { EventBus } from './EventBus.js';

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

  use(fn) { 
    this.middlewares.push(fn); 
    return this; 
  }
  
  on(event, callback) { 
    this.globalEvents.on(event, callback); 
  }

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

  close() {
    this.logger.info(`Коректне закриття простору назв. Кількість сокетів: ${this.sockets.size}`, `Namespace:${this.name}`);
    
    const payload = JSON.stringify({ 
      event: 'server_shutdown', 
      data: { message: 'Сервер іде на перезавантаження. Будь ласка, зачекайте.' } 
    });
    
    for (const socket of this.sockets.values()) {
      if (socket.rawWs.readyState === 1) {
        socket.rawWs.send(payload);
      }
    }

    for (const socket of this.sockets.values()) {
      this.serverOptions.gracePeriodMs = 0; 
      socket.rawWs.close(1012, 'Server shutting down');
    }

    this.sockets.clear();
  }
}
