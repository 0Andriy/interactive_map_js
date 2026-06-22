import { WebSocketServer } from 'ws';
import { Namespace } from './Namespace.js';
import { Socket } from './Socket.js';
import url from 'url';

export class IoServer {
  constructor(adapterFactory, options = {}) {
    this.adapterFactory = adapterFactory;
    this.namespaces = new Map();
    this.allSockets = new Map(); // Глобальний масив усіх фізичних сокетів для Heartbeat
    this.wss = null;
    this.heartbeatInterval = null;

    this.options = {
      path: options.path || '/socket.io/',
      gracePeriodMs: options.gracePeriodMs || 0,
      pingIntervalMs: options.pingIntervalMs || 30000, // Раз на 30 сек пінгуємо
    };

    this.of('/');
    this.#startHeartbeatLoop();
  }

  // ВИСОКОПРОДУКТИВНИЙ ГЛОБАЛЬНИЙ ХІРТБІТ
  #startHeartbeatLoop() {
    this.heartbeatInterval = setInterval(() => {
      for (const [socketId, socket] of this.allSockets.entries()) {
        // Якщо з минулого циклу клієнт так і не скинув свій прапорець в true — він «зомбі»
        if (socket.isAlive === false) {
          console.warn(`[Heartbeat] Клієнт ${socketId} не відповів на pong. Примусове відключення.`);
          this.allSockets.delete(socketId);
          socket.terminate(); // Миттєво рвемо TCP
          continue;
        }

        // Опускаємо прапорець і надсилаємо системний бінарний Ping
        socket.isAlive = false;
        if (socket.rawWs.readyState === 1) {
          socket.rawWs.ping(); // Низькорівневий бінарний ping протоколу RFC 6455
        }
      }
    }, this.options.pingIntervalMs);
    
    // Запобігаємо утриманню процесу Node.js, якщо сервер зупиняється
    this.heartbeatInterval.unref(); 
  }

  of(name) {
    if (!this.namespaces.has(name)) {
      const adapterInstance = this.adapterFactory(name);
      this.namespaces.set(name, new Namespace(name, adapterInstance, this.options));
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

        const customSocket = new Socket(ws, socketId, nsp, handshake);
        
        // Реєструємо у глобальному циклі хіртбіту
        this.allSockets.set(socketId, customSocket);

        customSocket.on('disconnect', () => {
          this.allSockets.delete(socketId);
        });

        nsp.addSocket(customSocket);
      });
    });
  }

  // Метод для повної зупинки сервера (очищення пам'яті)
  close() {
    clearInterval(this.heartbeatInterval);
    this.allSockets.clear();
    this.wss.close();
  }
}
