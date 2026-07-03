import { EventBus } from './EventBus.js'
import { BroadcastOperator } from './BroadcastOperator.js'

import { v7 as uuidv7 } from 'uuid'

/**
 * Клас Socket представляє індивідуальне віртуальне з'єднання з клієнтом.
 */
export class Socket {
    constructor(rawWs, id, nsp, handshake, sessionId = null, logger = null) {
        /**
         * Унікальний ідентифікатор цього з'єднання.
         * @type {string}
         * @public
         */
        this.id = id || uuidv7()

        /**
         * Унікальний ідентифікатор сесії.
         * @type {string}
         * @public
         */
        this.sessionId = sessionId || uuidv7()

        /**
         * Простір імен, до якого прив'язаний сокет.
         * @type {object}
         * @public
         */
        this.nsp = nsp

        /**
         * Низькорівневе з'єднання (транспорт).
         * @type {object}
         * @protected
         */
        this.conn = clientConnection

        // Канонічний об'єкт метаданих підключення
        /** @public */
        this.handshake = {
            /** @type {string} ISO мітка часу спроби підключення */
            time: handshake.time || new Date().toString(),
            /** @type {number} Епоха мілісекунд для швидких математичних порівнянь */
            issued: Date.now(),
            /** @type {string} Розпарсений чистий IP-адрес клієнта */
            address: handshake.address || '',
            /** @type {boolean} Чи використовується захищене TLS/SSL з'єднання */
            secure: !!handshake.secure,
            /** @type {string} Сирий HTTP метод запиту (завжди GET для WebSocket Upgrade) */
            method: request.method,
            /** @type {string} Повний оригінальний URL запиту (наприклад, '/socket.io/?token=123') */
            url: handshake.url || '/',
            /** @type {object} Повністю розпарсений Query-string у вигляді об'єкта ключових значень */
            query: handshake.query || {},
            /** @type {object} Повний сирий об'єкт HTTP заголовків */
            headers: handshake.headers || {},
            //
            sessionId: handshake.sessionId || null,
            // Решта
            ...handshake,
        }

        this.logger =
            logger?.child?.({ component: '[WS Socket]', socketId: this.id }) ?? logger ?? null

        this.events = new EventBus({ logger: this.logger })

        /**
         * Дата та час встановлення підключення.
         * @type {Date}
         * @public
         */
        this.connectedAt = new Date()

        /**
         * Дата та час останньої зафіксованої активності (пакет від клієнта / відправка клієнту).
         * @type {Date}
         * @public
         */
        this.lastActivityAt = new Date()

        /**
         * Прапорець, який показує, чи активне з'єднання на даний момент.
         * @type {boolean}
         * @public
         */
        this.connected = true

        /**
         * Сховище кастомних даних сокета (сесія користувача, ID авторизації тощо).
         * @type {object}
         * @public
         */
        this.data = {}

        /**
         * Мапа активних ACK-коллбеків, які очікують відповіді від клієнта.
         * Ключ — унікальний ID запиту (id), значення — функція відповіді.
         * @type {Map<number, Function>}
         * @private
         */
        this.acks = new Map()

        /**
         * Лічильник для генерації унікальних ID для ACK пакетів.
         * @type {number}
         * @private
         */
        this.ackCounter = 0

        // НЮАНС SOCKET.IO: Кожен сокет автоматично підключається до своєї індивідуальної кімнати,
        // назва якої збігається з його власною ID. Це дозволяє слати повідомлення конкретному юзеру: io.to(socketId).emit()
        this.join(this.id).catch((err) => this._onWrappedError(err))

        this.#initListeners()
    }

    //  ============== Проксі методи до BroadcastOperator

    /**
     * Повертає BroadcastOperator для надсилання подій усім сокетам, ОКРІМ поточного.
     * Реалізує канонічну конструкцію: socket.broadcast.to('room').emit('event')
     * @returns {BroadcastOperator}
     */
    get broadcast() {
        return new BroadcastOperator(this.nsp.adapter).broadcast(this.id)
    }

    /**
     * Створює volatile-оператор розсилки.
     * @returns {BroadcastOperator}
     */
    get volatile() {
        return new BroadcastOperator(this.nsp.adapter, this.id).volatile
    }

    /**
     * Націлює наступний ланцюжок розсилки у конкретну кімнату.
     * @param {string} roomName
     * @returns {BroadcastOperator}
     */
    to(roomName) {
        return new BroadcastOperator(this.nsp.adapter, this.id).to(roomName)
    }

    /**
     * Аліас для методу .to()
     * @param {string} roomName
     * @returns {BroadcastOperator}
     */
    in(roomName) {
        return this.to(roomName)
    }

    //  ============== Проксі методи до EventDriver

    /**
     * Підписує на внутрішні події сокета (наприклад, бізнес-події від клієнта).
     * @param {string} event
     * @param {Function} callback
     */
    on(event, callback) {
        this.events.on(event, callback)
    }

    //  ============== RoomManager

    /**
     * Додає сокет до конкретної кімнати.
     * @param {string} roomName - Назва кімнати.
     * @returns {Promise<void>}
     */
    async join(roomName) {
        if (typeof roomName !== 'string' || !roomName) return
        this._touch()
        await this.nsp.adapter.add(this.id, roomName)
        this.events.emit('join', roomName)
    }

    /**
     * Видаляє сокет з конкретної кімнати.
     * @param {string} roomName - Назва кімнати.
     * @returns {Promise<void>}
     */
    async leave(roomName) {
        if (typeof roomName !== 'string' || !roomName) return
        this._touch()
        await this.nsp.adapter.del(this.id, roomName)
        this.events.emit('leave', roomName)
    }

    /**
     * Повертає список кімнат, у яких зараз перебуває цей сокет.
     * @returns {Promise<Set<string>>}
     */
    async rooms() {
        return await this.nsp.adapter.getRoomsBySocket(this.id)
    }

    /**
     * Перевіряє, чи перебуває сокет у вказаній кімнаті.
     * Працює залізобетонно, навіть якщо у сокета немає кімнат (поверне false).
     * @param {string} roomName
     * @returns {boolean}
     */
    hasRoom(roomName) {
        if (typeof roomName !== 'string' || roomName.trim() === '') return false

        return this.rooms.has(roomName)
    }

    /**
     * Пряме надсилання повідомлення ТІЛЬКИ цьому конкретному клієнту.
     * Підтримує асинхронні відповіді від клієнта (ACK).
     * @param {string} event - Назва події.
     * @param {...any} args - Аргументи події. Якщо останнім аргументом передано функцію — вона реєструється як ACK.
     * @returns {boolean} true, якщо пакет успішно передано низькорівневому транспорту.
     */
    emit(event, ...args) {
        if (typeof event !== 'string' || !event || !this.connected) return false
        this._touch()

        const packet = {
            type: 'event',
            event,
            data: args,
        }

        // Перевіряємо, чи клієнт (серверний код) очікує відповіді (наявність callback останнім аргументом)
        const lastArg = args[args.length - 1]
        if (typeof lastArg === 'function') {
            const callback = args.pop() // видаляємо функцію з масиву даних пакета
            packet.data = args

            this.ackCounter++
            const ackId = this.ackCounter
            packet.ackId = ackId // додаємо ID запиту в сирий пакет

            this.acks.set(ackId, callback)
        }

        return this.sendPacket(packet)
    }

    /**
     * Низькорівневий метод відправки сирого об'єкта пакета у WebSocket/TCP з'єднання.
     * Сюди прилітають пакети як від особистого .emit(), так і трансляції від адаптера.
     * @param {object} packet - Сирий об'єкт пакета.
     * @param {object} [flags={}] - Опціональні прапорці розсилки (.volatile, .compressed тощо).
     * @returns {boolean}
     */
    sendPacket(packet, flags = {}) {
        if (!this.connected || !this.conn) return false

        try {
            // ЗАХИСТ: Перевіряємо наявність нативного методу відправки в залежності від ws/tcp ліби
            // (наприклад, у бібліотеці 'ws' це метод socket.send())
            const sendMethod = this.conn.send || this.conn.write || this.conn.sendPacket
            if (typeof sendMethod !== 'function') return false

            const serializedData = JSON.stringify(packet)

            // Передаємо прапорці стиснення або бінарності, якщо вони підтримуються транспортом
            const sendOptions = {
                compress: !!flags.compressed,
                binary: !!flags.binary,
            }

            sendMethod.call(this.conn, serializedData, sendOptions)
            return true
        } catch (error) {
            this._onWrappedError(error)
            return false
        }
    }

    /**
     * Внутрішній метод, який викликається інфраструктурою сервера, коли від клієнта приходить сирий пакет даних.
     * @param {string} serializedPacket - Серіалізований JSON-пакет від клієнта.
     * @returns {void}
     */
    _onMessage(serializedPacket) {
        if (typeof serializedPacket !== 'string') return
        this._touch()

        try {
            const packet = JSON.parse(serializedPacket)
            if (!packet || typeof packet.type !== 'string') return

            // Сценарій 1: Клієнт прислав звичайну подію
            if (packet.type === 'event' && typeof packet.event === 'string') {
                const args = Array.isArray(packet.data) ? packet.data : []

                // НЮАНС SOCKET.IO: якщо клієнт прислав event разом із ackId,
                // ми створюємо функцію-відповідь і кидаємо її останнім аргументом нашому серверному підписнику
                if (typeof packet.ackId === 'number') {
                    const ackResponseTrigger = (...responseArgs) => {
                        this.sendPacket({
                            type: 'ack',
                            ackId: packet.ackId,
                            data: responseArgs,
                        })
                    }
                    args.push(ackResponseTrigger)
                }

                // Передаємо обробку події у простір імен Namespace
                if (typeof this.nsp._dispatchSocketEvent === 'function') {
                    this.nsp._dispatchSocketEvent(this, packet.event, args)
                }
            }

            // Сценарій 2: Клієнт відповів на наш минулий еміт (Прилетів ACK)
            if (packet.type === 'ack' && typeof packet.ackId === 'number') {
                const callback = this.acks.get(packet.ackId)
                if (callback) {
                    this.acks.delete(packet.ackId)
                    const responseData = Array.isArray(packet.data) ? packet.data : []

                    // Викликаємо коллбек розробника з даними відповіді клієнта
                    callback(...responseData)
                }
            }
        } catch (error) {
            this._onWrappedError(error)
        }
    }

    /**
     * Примусове закриття з'єднання з клієнтом (Аналог socket.disconnect()).
     * @param {boolean} [closeTransport=true] - Чи потрібно жорстко рвати мережевий тайтл TCP/WS.
     * @returns {this}
     */
    disconnect(closeTransport = true) {
        if (!this.connected) return this
        this.connected = false

        // Очищаємо всі незакриті ACK-коллбеки, щоб уникнути витоків пам'яті
        this.acks.clear()

        // Повідомляємо Namespace, що сокет помер. Namespace запустить процедуру io.adapter.delAll(socket.id)
        if (typeof this.nsp._removeSocket === 'function') {
            this.nsp._removeSocket(this)
        }

        if (closeTransport && this.conn) {
            try {
                const closeMethod = this.conn.close || this.conn.end || this.conn.destroy
                if (typeof closeMethod === 'function') {
                    closeMethod.call(this.conn)
                }
            } catch (error) {
                // ігноруємо помилки закриття вже мертвого сокета
            }
        }

        this.conn = null
        return this
    }

    /**
     * Оновлює мітку часу останньої активності сокета.
     * @private
     */
    _touch() {
        this.lastActivityAt = new Date()
    }

    /**
     * Внутрішня маршрутизація помилок у батьківський Namespace.
     * @param {Error|any} error
     * @private
     */
    _onWrappedError(error) {
        if (typeof this.nsp?._handleError === 'function') {
            this.nsp._handleError(`socket_error:[${this.id}]`, error)
        }
    }
}
