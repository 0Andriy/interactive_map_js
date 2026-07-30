import { MiniEventEmitter } from './MiniEventEmitter.js'
import { BroadcastOperator } from './BroadcastOperator.js'
import { Socket } from './Socket.js'
import { ConnWrapper } from './ConnWrapper.js'

export class Namespace {
    /**
     * @param {string|RegExp} name - Назва або регулярний вираз простору імен.
     * @param {Object} server - Посилання на головний екземпляр Server.
     * @param {Function} AdapterClass - Клас адаптера для інжекції залежностей.
     */
    constructor(name, server, AdapterClass) {
        this.name = name
        this.server = server
        this.sockets = new Map()

        // Композитна шина для подій життя простору імен (connect, connection)
        this.events = new MiniEventEmitter()

        this.adapter = new AdapterClass(this)
        this._middlewares = []

        // Адаптер підписується на шину простору імен (Слабка зв'язаність)
        this.events.on('adapter_add', (socketId, roomName) => this.adapter.add(socketId, roomName))
        this.events.on('adapter_del', (socketId, roomName) => this.adapter.del(socketId, roomName))
        this.events.on('adapter_del_all', (socketId) => this.adapter.delAll(socketId))
    }

    on(event, callback) {
        this.events.on(event, callback)
        return this
    }

    off(event, callback) {
        this.events.off(event, callback)
        return this
    }

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
     * Викликається сервером після успішного HTTP Upgrade та автентифікації.
     *
     * @param {Object} rawWs - Сире з'єднання ws.
     * @param {Object} handshake - Сформований сервером об'єкт хендшейку з UUID.
     */
    handleConnection(rawWs, handshake) {
        // Загортаємо сирий сокет у транспортну обгортку
        const connWrapper = new ConnWrapper(rawWs)
        // Створюємо бізнес-об'єкт Сокета
        const socket = new Socket(this, connWrapper, handshake)

        // Запускаємо локальні middleware простору імен (якщо є)
        this._runMiddlewares(socket, (err) => {
            if (err) {
                socket.sendRaw({ type: 'connect_error', data: err.message || err })
                socket.disconnect(true)
                return
            }

            // Додаємо сокет у локальний пул
            this.sockets.set(socket.id, socket)

            // Просимо адаптер створити персональну кімнату сокета через івент-шину
            this.events.emitWithContext('adapter_add', this, [socket.id, socket.id])

            // Тригеримо події підключення
            this.events.emitWithContext('connect', this, [socket])
            this.events.emitWithContext('connection', this, [socket])
        })
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
