import { WebSocketServer } from 'ws';
import { Namespace } from './Namespace.js';
import { Socket } from './Socket.js';
import url from 'url';

export class IoServer {
  constructor(adapterFactory, logger, options = {}) {
    this.adapterFactory = adapterFactory;
    this.logger = logger;
    this.namespaces = new Map();
    this.allSockets = new Map();
    this.heartbeatInterval = null;

    this.options = {
      path: options.path || '/socket.io/',
      gracePeriodMs: options.gracePeriodMs || 0,
      pingIntervalMs: options.pingIntervalMs || 30000,
    };

    // Створюємо головний неймспейс за замовчуванням
    this.of('/');
    this.#startHeartbeatLoop();
  }

  // ФІЧА: Еміт на дефолтному просторі назв "/" за допомогою io.emit()
  emit(event, data) {
    return this.of('/').emit(event, data);
  }

  // ФІЧА: Розсилка в кімнати з головного сервера за допомогою io.to('room').emit()
  to(roomName) {
    return this.of('/').to(roomName);
  }

  in(roomName) {
    return this.to(roomName);
  }

  #startHeartbeatLoop() {
    this.heartbeatInterval = setInterval(() => {
      for (const [socketId, socket] of this.allSockets.entries()) {
        if (socket.isAlive === false) {
          this.logger.warn(`Клієнт не відповів на попередній Ping. Ініціюємо термінацію.`, `Heartbeat:${socketId}`);
          this.allSockets.delete(socketId);
          socket.terminate();
          continue;
        }
        socket.isAlive = false;
        if (socket.rawWs.readyState === 1) socket.rawWs.ping();
      }
    }, this.options.pingIntervalMs).unref();
  }

  of(name) {
    if (!this.namespaces.has(name)) {
      const adapterInstance = this.adapterFactory(name);
      this.namespaces.set(name, new Namespace(name, adapterInstance, this.options, this.logger));
      this.logger.info(`Створено новий ізольований простір назв (Namespace): "${name}"`, 'IoServer');
    }
    return this.namespaces.get(name);
  }

  attach(httpServer) {
    this.wss = new WebSocketServer({ noServer: true });

    httpServer.on('upgrade', (request, socket, head) => {
      const parsedUrl = url.parse(request.url, true);
      const fullPath = parsedUrl.pathname || '/';

      if (!fullPath.startsWith(this.options.path)) return;

      let nspName = fullPath.substring(this.options.path.length - 1);
      if (nspName === '') nspName = '/';

      const nsp = this.namespaces.get(nspName);
      if (!nsp) {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
        return;
      }

      this.wss.handleUpgrade(request, socket, head, (ws) => {
        const socketId = `sid_${Math.random().toString(36).substring(2, 11)}`;
        const handshake = {
          headers: request.headers,
          query: parsedUrl.query,
          time: new Date().toISOString()
        };

        const customSocket = new Socket(ws, socketId, nsp, handshake, this.logger);
        this.allSockets.set(socketId, customSocket);

        customSocket.on('disconnect', () => { this.allSockets.delete(socketId); });
        nsp.addSocket(customSocket);
      });
    });
  }

  close() {
    clearInterval(this.heartbeatInterval);
    for (const nsp of this.namespaces.values()) {
      nsp.close();
    }
    this.allSockets.clear();
    if (this.wss) this.wss.close();
  }
}
