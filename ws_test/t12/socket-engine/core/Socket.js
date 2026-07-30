import { BroadcastOperator } from './BroadcastOperator.js'

/**
 * Клас, що представляє індивідуальне клієнтське з'єднання (Сокет).
 */
export class Socket {
    /**
     * Створює екземпляр сокета.
     *
     * @param {Object} namespace - Простір імен (Namespace), до якого належить сокет.
     * @param {Object} conn - Базове транспортне з'єднання (наприклад, клієнт ws/uWebSockets).
     * @param {Object} [handshake={}] - Дані авторизації та заголовків клієнта.
     */
    constructor(namespace, conn, handshake = {}) {
        /** @type {Object} */
        this.nsp = namespace
        /** @type {Object} */
        this.conn = conn
        /** @type {Object} */
        this.handshake = handshake

        /**
         * Унікальний ідентифікатор сокета.
         * @type {string}
         */
        this.id = conn.id || Math.random().toString(36).substring(2, 15)

        /**
         * Лічильник для створення унікальних ID пакетів з очікуванням відповіді (ack).
         * @private
         */
        this._ackId = 0

        /**
         * Карта активних колбеків, де ключ — ID пакета, а значення — функція-відповідь.
         * @private
         */
        this._acks = new Map()

        this._setupTransport()
    }

    /**
     * Налаштовує слухачі подій базового транспорту.
     * @private
     */
    _setupTransport() {
        // Обробка вхідних даних від клієнта
        this.conn.on('message', (rawMessage) => {
            try {
                const packet = JSON.parse(rawMessage)
                this._onPacket(packet)
            } catch (err) {
                // Бінарні дані або некоректний JSON ігноруємо
            }
        })

        // Обробка відключення клієнта
        this.conn.on('close', () => {
            this._onDisconnect()
        })
    }

    /**
     * Внутрішній обробник десеріалізованих пакетів.
     * @private
     */
    _onPacket(packet) {
        // Якщо це відповідь клієнта на наш попередній запит (ack)
        if (packet.type === 'ack') {
            const callback = this._acks.get(packet.id)
            if (callback) {
                this._acks.delete(packet.id)
                callback(...packet.data)
            }
            return
        }

        // Якщо це звичайна подія від клієнта
        if (packet.type === 'event') {
            const [event, ...args] = packet.data

            // Якщо клієнт очікує від нас відповідь, останнім аргументом передаємо функцію-колбек
            if (packet.id !== undefined) {
                const ackCallback = (...replyArgs) => {
                    this.sendRaw({
                        type: 'ack',
                        id: packet.id,
                        data: replyArgs,
                    })
                }
                this.nsp._emitToSocket(this.id, event, [...args, ackCallback])
            } else {
                this.nsp._emitToSocket(this.id, event, args)
            }
        }
    }

    /**
     * Надсилає подію безпосередньо цьому клієнту.
     * Підтримує синтаксис з callback-функцією в кінці: `socket.emit('get-info', (data) => {})`
     *
     * @param {string} event - Назва події.
     * @param {...any} args - Аргументи події.
     * @returns {void}
     */
    emit(event, ...args) {
        const hasCallback = typeof args[args.length - 1] === 'function'
        const callback = hasCallback ? args.pop() : null

        const packet = {
            type: 'event',
            data: [event, ...args],
        }

        // Якщо передано колбек, реєструємо його та додаємо ID пакета
        if (callback) {
            const id = this._ackId++
            this._acks.set(id, callback)
            packet.id = id
        }

        this.sendRaw(packet)
    }

    /**
     * Низькорівневе відправлення пакета, яке викликається адаптером та оператором.
     * @param {Object} packet - Об'єкт пакета для серіалізації.
     */
    sendRaw(packet) {
        if (this.conn && typeof this.conn.send === 'function') {
            this.conn.send(JSON.stringify(packet))
        }
    }

    /**
     * Додає сокет до вказаної кімнати.
     * @param {string} room
     */
    join(room) {
        this.nsp.adapter.add(this.id, room)
    }

    /**
     * Видаляє сокет із вказаної кімнати.
     * @param {string} room
     */
    leave(room) {
        this.nsp.adapter.del(this.id, room)
    }

    /**
     * Примусово закриває з'єднання із сокетом.
     * @param {boolean} [closeTransport=false]
     */
    disconnect(closeTransport = false) {
        this._onDisconnect()
        if (closeTransport && typeof this.conn.close === 'function') {
            this.conn.close()
        }
    }

    /**
     * Внутрішній метод очищення даних сокета при відключенні.
     * @private
     */
    _onDisconnect() {
        this.nsp.sockets.delete(this.id)
        this.nsp.adapter.delAll(this.id)
        this.nsp._emitToSocket(this.id, 'disconnect', ['transport close'])
    }

    // --- ПОЧАТОК ЛАНЦЮЖКІВ ТРАНСЛЯЦІЇ ВІД ІМЕНІ СОКЕТА (БЕЗ НЬОГО САМОГО) ---

    /**
     * Створює оператор розсилки, який автоматично виключає цей сокет (`except(this.id)`).
     * Еквівалент `socket.to('room').emit()` у Socket.IO.
     *
     * @param {string|string[]} room
     * @returns {BroadcastOperator}
     */
    to(room) {
        return new BroadcastOperator(this.nsp.adapter).to(room).except(this.id)
    }

    /** Синонім до `.to()` */
    in(room) {
        return this.to(room)
    }
}
