import { WebSocketServer } from 'ws';
import { Socket } from './Socket.js';
import url from 'url';

export class IoServer {
  // Фабрика адаптерів передається ззовні (Повний DI)
  constructor(adapterFactory) {
    this.adapterFactory = adapterFactory;
    this.namespaces = new Map();
    this.wss = null;
  }

  of(name) {
    if (!this.namespaces.has(name)) {
      // Створюємо адаптер для конкретного неймспейсу через інжектовану фабрику
      const adapterInstance = this.adapterFactory(name);
      this.namespaces.set(name, new Namespace(name, adapterInstance));
    }
    return this.namespaces.get(name);
  }

  attach(httpServer) {
    this.wss = new WebSocketServer({ noServer: true });

    httpServer.on('upgrade', (request, socket, head) => {
      const parsedUrl = url.parse(request.url, true);
      const pathname = parsedUrl.pathname || '/';
      const nsp = this.namespaces.get(pathname);

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
