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

    this.of('/');
    this.#startHeartbeatLoop();
  }

  #startHeartbeatLoop() {
    this.logger.info(`Запуск глобального циклу Heartbeat (Перевірка кожні ${this.options.pingIntervalMs}мс)`, 'IoServer');
    this.heartbeatInterval = setInterval(() => {
      this.logger.debug(`Запуск перевірки "зомбі"-клієнтів. Активних сокетів на ноді: ${this.allSockets.size}`, 'Heartbeat');
      for (const [socketId, socket] of this.allSockets.entries()) {
        if (socket.isAlive === false) {
          this.logger.warn(`Клієнт не відповів на попередній Ping. Ініціюємо термінацію.`, `Heartbeat:${socketId}`);
          this.allSockets.delete(socketId);
          socket.terminate();
          continue;
        }
        socket.isAlive = false;
        if (socket.rawWs.readyState === 1) {
          socket.rawWs.ping();
        }
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
    this.logger.info(`WebSocket шар успішно прикріплено до HTTP сервера. Очікування на Upgrade шляху: ${this.options.path}*`, 'IoServer');

    httpServer.on('upgrade', (request, socket, head) => {
      const parsedUrl = url.parse(request.url, true);
      const fullPath = parsedUrl.pathname || '/';

      if (!fullPath.startsWith(this.options.path)) return;

      let nspName = fullPath.substring(this.options.path.length - 1);
      if (nspName === '') nspName = '/';

      const nsp = this.namespaces.get(nspName);
      if (!nsp) {
        this.logger.warn(`Запит на Upgrade відхилено: Немає Namespace для шляху "${fullPath}"`, 'IoServer');
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

        customSocket.on('disconnect', () => { 
          this.allSockets.delete(socketId); 
        });
        
        nsp.addSocket(customSocket);
      });
    });
  }

  close() {
    this.logger.info('Ініційовано закриття сокет-сервера...', 'IoServer');
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    for (const nsp of this.namespaces.values()) {
      nsp.close();
    }
    this.allSockets.clear();
    if (this.wss) {
      this.wss.close(() => {
        this.logger.info('Внутрішній WebSocketServer повністю зупинено.', 'IoServer');
      });
    }
  }
}
