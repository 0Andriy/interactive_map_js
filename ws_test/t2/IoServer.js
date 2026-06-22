import { WebSocketServer } from 'ws';
import { Namespace } from './Namespace.js';
import { Socket } from './Socket.js';
import url from 'url';

export class IoServer {
  constructor(AdapterClass) {
    this.AdapterClass = AdapterClass; // Впроваджуємо клас адаптера як глобальну залежність (DI)
    this.namespaces = new Map();
    this.wss = null;

    // Автоматично створюємо дефолтний головний простір назв "/"
    this.of('/');
  }

  // Створення або отримання існуючого Namespace
  of(name) {
    if (!this.namespaces.has(name)) {
      this.namespaces.set(name, new Namespace(name, this.AdapterClass));
    }
    return this.namespaces.get(name);
  }

  attach(httpServer) {
    // Створюємо сервер, але відключаємо автоматичну обробку шляхів, будемо розбирати вручну
    this.wss = new WebSocketServer({ noServer: true });

    // Перехоплюємо HTTP Upgrade запит
    httpServer.on('upgrade', (request, socket, head) => {
      const parsedUrl = url.parse(request.url, true);
      const pathname = parsedUrl.pathname || '/';

      // Шукаємо підходящий Namespace
      const nsp = this.namespaces.get(pathname);

      if (!nsp) {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
        return;
      }

      // Якщо Namespace знайдено, робимо Upgrade з'єднання до WebSocket
      this.wss.handleUpgrade(request, socket, head, (ws) => {
        const socketId = `sid_${Math.random().toString(36).substring(2, 11)}`;
        
        // Формуємо об'єкт handshake
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

  // Проксі-метод для реєстрації подій на дефолтному неймспейсі "/"
  on(event, callback) {
    this.of('/').on(event, callback);
  }
}
