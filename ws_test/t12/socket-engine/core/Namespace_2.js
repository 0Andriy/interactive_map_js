import { InMemoryAdapter } from './InMemoryAdapter.js'
import { BroadcastOperator } from './BroadcastOperator.js'
import { Socket } from './Socket.js'
import { MiniEventEmitter } from './MiniEventEmitter.js'

export class Namespace {
    /**
     * @param {string} name
     * @param {Function} [AdapterClass=InMemoryAdapter]
     */
    constructor(name, AdapterClass = InMemoryAdapter) {
        this.name = name
        this.sockets = new Map()

        // Композитна шина для подій простору імен (connection, connect)
        this.events = new MiniEventEmitter()

        this.adapter = new AdapterClass(this)
        this._middlewares = []
    }

    /**
     * Головний метод підписки для розробника (io.on('connection'))
     */
    on(event, callback) {
        this.events.on(event, callback)
        return this
    }

    off(event, callback) {
        this.events.off(event, callback)
        return this
    }

    /**
     * Додавання middleware (io.use((socket, next) => {}))
     */
    use(fn) {
        this._middlewares.push(fn)
        return this
    }

    /** @private */
    _runMiddlewares(socket, callback) {
        let index = 0
        const next = (err) => {
            if (err) return callback(err)
            const middleware = this._middlewares[index++]
            if (middleware) {
                try {
                    middleware(socket, next)
                } catch (e) {
                    next(e)
                }
            } else {
                callback(null)
            }
        }
        next()
    }

    /**
     * Точка входу для нового клієнта. Точно повторює послідовність Socket.IO.
     */
    addConnection(rawConn, handshake = {}) {
        const socket = new Socket(this, rawConn, handshake)

        // 1. Спочатку проганяємо через middleware
        this._runMiddlewares(socket, (err) => {
            if (err) {
                // В Socket.IO при помилці middleware надсилається пакет connect_error
                socket.sendRaw({ type: 'connect_error', data: err.message || err })
                socket.disconnect(true)
                return
            }

            // 2. Додаємо в пул активних сокетів ноди
            this.sockets.set(socket.id, socket)

            // 3. Автоматично створюємо персональну кімнату для сокета в адаптері
            this.adapter.add(socket.id, socket.id)

            // 4. Тільки тепер викликаємо події успішного підключення
            this.events.emitWithContext('connect', this, [socket])
            this.events.emitWithContext('connection', this, [socket])
        })

        return socket
    }

    // --- ОПЕРАТОРИ РОЗСИЛКИ ---
    to(room) {
        return new BroadcastOperator(this.adapter).to(room)
    }
    except(room) {
        return new BroadcastOperator(this.adapter).except(room)
    }
    emit(event, ...args) {
        return new BroadcastOperator(this.adapter).emit(event, ...args)
    }
}
