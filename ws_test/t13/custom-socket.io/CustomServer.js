import { WebSocketServer } from 'ws'
import url from 'url'
import { Namespace } from './Namespace.js'

export class CustomServer {
    constructor(httpServer, options = {}) {
        this.namespaces = new Map()

        // Створюємо сервер ws без прив'язки до порту, а через інтеграцію з http
        this.wss = new WebSocketServer({ noServer: true })

        // Інтегруємося в HTTP сервер для обробки WebSocket-рукостискання (Upgrade)
        httpServer.on('upgrade', (request, socket, head) => {
            const parsedUrl = url.parse(request.url, true)
            const pathname = parsedUrl.pathname

            // Шукаємо відповідний namespace (наприклад, '/chat')
            const nsp = this.namespaces.get(pathname)

            if (!nsp) {
                // Якщо такого простору імен немає, закриваємо з'єднання
                socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
                socket.destroy()
                return
            }

            // Витягуємо токен з query-параметрів або headers для сумісності з auth подібною логікою
            const token = parsedUrl.query?.token || request.headers['authorization']

            this.wss.handleUpgrade(request, socket, head, (ws) => {
                const handshakeData = {
                    auth: { token },
                    headers: request.headers,
                }
                nsp._handleConnection(ws, handshakeData)
            })
        })
    }

    // Метод реєстрації простору імен (io.of)
    of(namespaceName) {
        if (!this.namespaces.has(namespaceName)) {
            this.namespaces.set(namespaceName, new Namespace(namespaceName))
        }
        return this.namespaces.get(namespaceName)
    }

    // Метод для глобального еміту (хоча у вашому коді все йде через namespace)
    emit(eventName, ...args) {
        this.namespaces.forEach((nsp) => {
            nsp._emitToNamespace({ type: 'event', name: eventName, args })
        })
    }
}
