// server.js
import { WebSocketServer } from 'ws'
import url from 'url'
import { EventEmitter } from './utils/EventEmitter.js'
import { Namespace } from './core/Namespace.js'
import { RedisAdapter } from './adapters/RedisAdapter.js' // Будемо реалізовувати далі

export class WebSocketServerManager extends EventEmitter {
    constructor(options = {}) {
        super()
        this.wss = new WebSocketServer(options)
        this.namespaces = new Map() // Map<path, Namespace>
        this.defaultNamespace = this.of('/') // Завжди є дефолтний простір імен

        // Опціональний адаптер для масштабування
        this.adapter = null
        if (options.redisOptions) {
            this.adapter = new RedisAdapter(options.redisOptions, this)
            this.adapter.on('message', this.handleAdapterMessage.bind(this))
        }

        this.wss.on('connection', this.handleConnection.bind(this))
        this.wss.on('error', this.handleError.bind(this))
        this.wss.on('listening', () => {
            console.log(`WS Server listening on port ${options.port || 80}`)
        })
    }

    // Метод для отримання або створення простору імен
    of(path) {
        if (!this.namespaces.has(path)) {
            const namespace = new Namespace(path, this)
            this.namespaces.set(path, namespace)
        }
        return this.namespaces.get(path)
    }

    // Обробник нового WebSocket-з'єднання
    handleConnection(ws, req) {
        const pathname = url.parse(req.url).pathname || '/'
        const targetNamespace = this.namespaces.get(pathname)

        if (targetNamespace) {
            // Тут можна додати логіку аутентифікації/авторизації (Middleware)
            // Наприклад, на основі req.headers або req.url.query
            // const token = url.parse(req.url, true).query.token;
            // if (!this.authenticate(token)) {
            //   ws.close(1008, 'Authentication Failed');
            //   return;
            // }

            targetNamespace.addSocket(ws)
        } else {
            console.warn(`Connection to unknown namespace: ${pathname}. Closing.`)
            ws.close(1000, 'Unknown Namespace')
        }
    }

    // Централізований обробник повідомлень від адаптера (для масштабування)
    handleAdapterMessage(message) {
        const { type, namespace, room, event, data, exceptId } = message
        const targetNs = this.namespaces.get(namespace)

        if (!targetNs) return

        if (type === 'namespace_broadcast') {
            // Розсилаємо всім у цьому просторі імен, крім тих, хто вже отримав (на цьому сервері)
            // У нашому випадку, ми просто розсилаємо, оскільки MessageProtocol не відстежує senderId
            targetNs.emit(event, data)
        } else if (type === 'room_broadcast' && targetNs.roomManager.rooms.has(room)) {
            // Розсилаємо всім у кімнаті цього простору імен
            targetNs.to(room).emit(event, data)
        } else if (type === 'namespace_broadcast_except') {
            for (const socket of targetNs.sockets.values()) {
                if (socket.id !== exceptId && socket.ws.readyState === socket.ws.OPEN) {
                    socket.emit(event, data)
                }
            }
        }
    }

    handleError(error) {
        console.error('WS Server error:', error)
        this.emit('error', error)
    }

    // Метод для імітації Socket.IO `io.emit` (розсилка всім у дефолтному просторі імен)
    emit(event, data) {
        this.defaultNamespace.emit(event, data)
    }
}
