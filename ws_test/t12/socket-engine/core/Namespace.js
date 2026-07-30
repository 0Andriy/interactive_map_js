import { InMemoryAdapter } from './InMemoryAdapter.js'
import { BroadcastOperator } from './BroadcastOperator.js'
import { Socket } from './Socket.js'

/**
 * Клас, що керує ізольованим простором імен, пулом сокетів та подіями.
 */
export class Namespace {
    /**
     * Створює екземпляр простору імен.
     *
     * @param {string} name - Назва простору (наприклад, '/' або '/chat').
     * @param {Function} [AdapterClass=InMemoryAdapter] - Клас адаптера для керування кімнатами.
     */
    constructor(name, AdapterClass = InMemoryAdapter) {
        /**
         * Шлях простору імен.
         * @type {string}
         */
        this.name = name

        /**
         * Карта всіх активних сокетів у цьому просторі імен на поточному сервері.
         * @type {Map<string, Socket>}
         */
        this.sockets = new Map()

        /**
         * Екземпляр адаптера (InMemory або Redis).
         * @type {Object}
         */
        this.adapter = new AdapterClass(this)

        /**
         * Карта глобальних слухачів подій простору імен (наприклад, 'connection').
         * @private
         */
        this._fns = new Map()

        /**
         * Карта слухачів подій, які вішаються на кожен окремий сокет.
         * @private
         */
        this._socketListeners = new Map()
    }

    /**
     * Реєструє обробник подій для всього простору імен (наприклад, 'connection').
     *
     * @param {string} event - Назва події.
     * @param {Function} callback - Функція обробки.
     */
    on(event, callback) {
        if (event === 'connection' || event === 'connect') {
            this._fns.set('connection', callback)
        } else {
            // Реєструємо подію, яка за замовчуванням має застосовуватися до сокетів
            let listeners = this._socketListeners.get(event)
            if (!listeners) {
                listeners = []
                this._socketListeners.set(event, listeners)
            }
            listeners.push(callback)
        }
    }

    /**
     * Точка входу для нових транспортних з'єднань. Створює об'єкт сокета,
     * автоматично додає його в його персональну кімнату та ініціює подію 'connection'.
     *
     * @param {Object} rawConn - Сире з'єднання від веб-сокет сервера.
     * @param {Object} [handshake] - Дані авторизації клієнта.
     * @returns {Socket} Створений екземпляр класу Socket.
     */
    addConnection(rawConn, handshake = {}) {
        const socket = new Socket(this, rawConn, handshake)

        // 1. Зберігаємо сокет у пулі простору імен
        this.sockets.set(socket.id, socket)

        // 2. Кожен сокет автоматично є своєю власною кімнатою (стандарт Socket.IO)
        this.adapter.add(socket.id, socket.id)

        // 3. Автоматично підписуємо сокет на події, задекларовані через namespace.on()
        this._socketListeners.forEach((listeners, event) => {
            listeners.forEach((fn) => {
                // Перенаправляємо виклики на локальний метод nsp
                this.onSocketEvent(socket.id, event, fn)
            })
        })

        // 4. Викликаємо глобальний колбек 'connection'
        const connectionHandler = this._fns.get('connection')
        if (connectionHandler) {
            connectionHandler(socket)
        }

        return socket
    }

    /**
     * Безпечний виклик бізнес-логіки сокета всередині простору імен.
     * @private
     */
    _emitToSocket(socketId, event, args) {
        const listeners = this._socketListeners.get(event)
        if (listeners) {
            listeners.forEach((fn) => {
                const socket = this.sockets.get(socketId)
                // Викликаємо функцію з контекстом сокета та передаємо аргументи
                fn.apply(socket, args)
            })
        }
    }

    // --- ОРКЕСТРАЦІЯ ЛАНЦЮЖКІВ РОЗСИЛКИ ВІД ІМЕНІ СЕРВЕРА ---

    /**
     * Початок ланцюжка трансляції у конкретну кімнату.
     * Приклад: `nsp.to('room1').emit('hello')`
     *
     * @param {string|string[]} room
     * @returns {BroadcastOperator}
     */
    to(room) {
        return new BroadcastOperator(this.adapter).to(room)
    }

    /** Синонім до `.to()` */
    in(room) {
        return this.to(room)
    }

    /**
     * Початок ланцюжка трансляції з виключенням кімнати.
     * @param {string|string[]} room
     * @returns {BroadcastOperator}
     */
    except(room) {
        return new BroadcastOperator(this.adapter).except(room)
    }

    /**
     * Надсилає подію абсолютно ВСІМ сокетам у цьому просторі імен.
     * @param {string} event
     * @param {...any} args
     */
    emit(event, ...args) {
        return new BroadcastOperator(this.adapter).emit(event, ...args)
    }
}
