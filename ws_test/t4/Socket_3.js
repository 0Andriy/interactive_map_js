export class Socket {
  // Додано logger у конструктор
  constructor(rawWs, id, nsp, handshake, logger) {
    this.rawWs = rawWs;
    this.id = id;
    this.nsp = nsp;
    this.handshake = handshake;
    this.logger = logger; // DI
    
    this.events = new EventBus();
    this.isAlive = true;
    this.isVolatile = false;
    this.ackCallbacks = new Map();
    this.ackCounter = 0;

    this.#initListeners();
  }

  get rooms() { return this.nsp.adapter.sids.get(this.id) || new Set(); }
  on(event, callback) { this.events.on(event, callback); }

  emit(event, data, ackCallback = null) {
    if (this.rawWs.readyState !== 1) {
      this.logger.warn(`Спроба відправити еміт "${event}" у закритий сокет`, `Socket:${this.id}`);
      return;
    }
    // ... логіка пакету ...
    if (this.isVolatile && this.rawWs.bufferedAmount > 0) {
      this.isVolatile = false;
      this.logger.debug(`Дропнуто volatile пакет "${event}" через забитий буфер`, `Socket:${this.id}`);
      return;
    }
    this.isVolatile = false;
    this.rawWs.send(JSON.stringify(packet));
  }

  terminate() {
    this.logger.warn(`Примусове розірвання TCP з'єднання (terminate)`, `Socket:${this.id}`);
    this.rawWs.terminate();
  }

  // ... решта логіки join/leave без змін ...

  #initListeners() {
    this.rawWs.on('pong', () => { this.isAlive = true; });

    this.rawWs.on('message', (message) => {
      this.logger.debug(`Отримано сире повідомлення з мережі`, `Socket:${this.id}`);
      // ... логіка парсингу та емітів ...
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
