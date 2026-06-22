import { WebSocketServer } from 'ws';
import { Namespace } from './Namespace.js';
import { Socket } from './Socket.js';
import url from 'url';

export class IoServer {
  constructor(adapterFactory, options = {}) {
    this.adapterFactory = adapterFactory;
    this.namespaces = new Map();
    this.wss = null;

    // Налаштування за замовчуванням
    this.options = {
      path: options.path || '/socket.io/', // Базова адреса для вебсокетів
      gracePeriodMs: options.gracePeriodMs || 0, // 0 = миттєво, >0 = відкладено
    };

    // Ініціалізуємо дефолтний простір назв
    this.of('/');
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

      // Перевіряємо чи запит починається з нашої базової адреси (path)
      if (!fullPath.startsWith(this.options.path)) {
        return; // Ігноруємо, це запит не до нашої сокет-системи
      }

      // Вирізаємо назву неймспейсу
      // Приклад: path = "/my-base/", fullPath = "/my-base/chat" -> nspName = "/chat"
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
        nsp.addSocket(customSocket);
      });
    });
  }
}
