import { EventBus } from './EventBus.js'
import { BroadcastOperator } from './BroadcastOperator.js'

/**
 * Клас, що представляє активне високоуровневе клієнтське сокет-з'єднання.
 * Керує життєвим циклом, кімнатами, подіями та механізмом підтвердження (ACK).
 * Оптимізований для Highload: не містить локальних таймерів перевірки зв'язку.
 */
export class Socket {
    /**
     * Створює екземпляр Socket.
     * @param {any} rawWs - Сирий об'єкт веб-сокет з'єднання (ws або uWebSockets).
     * @param {string} id - Унікальний ідентифікатор сокета.
     * @param {any} nsp - Екземпляр простору імен (Namespace), до якого належить сокет.
     * @param {object} handshake - Об'єкт із даними первинного підключення (headers, query тощо).
     * @param {any} [logger=null] - Опціональний логер.
     */
    constructor(rawWs, id, nsp, handshake, logger = null) {
        this.rawWs = rawWs
        this.id = id
        this.nsp = nsp
        this.handshake = handshake

        this.logger = logger?.child?.({ component: '[WS Socket]', socketId: this.id }) ??
            logger ?? {
                info: () => {},
                warn: () => {},
                error: () => {},
                debug: () => {},
            }

        this.events = new EventBus({ logger: this.logger })
        this.isAlive = true
        this.isVolatile = false

        /** @type {Map<number, Function>} Активні коллбеки очікування відповіді: ackId -> Callback */
        this.ackCallbacks = new Map()
        this.ackCounter = 0

        /** @type {number} UNIX мітка останньої мережевої активності сокета (Highload Heartbeat) */
        this.lastActivity = Date.now()

        /** @type {NodeJS.Timeout|null} Таймер для перевірки працездатності з'єднання */ //heartbeatTimeout
        this.pingTimeoutTimer = null
        this.pingIntervalTimer = null
        this.pingTimer = null

        /** @type {number} Конфігураційний ліміт очікування */
        this.pingIntervalMs = this.nsp?.serverOptions?.pingIntervalMs || 25000
        this.pingTimeoutMs = this.nsp?.serverOptions?.pingTimeoutMs || 20000

        this.#initListeners()

        // Запускаємо ланцюжок перевірки відразу при створенні сокета
        // this.#startHeartbeat()
        this.#pingInbound()
    }

    /**
     * Геттер для отримання списку кімнат, у яких зараз перебуває цей сокет.
     * @returns {Set<string>}
     */
    get rooms() {
        return this.nsp.adapter.sids.get(this.id) || new Set()
    }

    /**
     * Підписує на внутрішні події сокета (наприклад, бізнес-події від клієнта).
     * @param {string} event
     * @param {Function} callback
     */
    on(event, callback) {
        this.events.on(event, callback)
    }

    /**
     * Генерує наступний унікальний ID для механізму підтвердження.
     * @private
     * @returns {number}
     */
    #nextAckId() {
        if (this.ackCounter >= Number.MAX_SAFE_INTEGER) {
            this.ackCounter = 0
        }
        return ++this.ackCounter
    }

    /**
     * Централізований фабричний метод для створення стандартизованого пакету повідомлення з метаданими.
     * @private
     * @param {string} event - Назва бізнес-події.
     * @param {any} data - Корисне навантаження (payload).
     * @param {number|null} [ackId=null] - Опціональний ідентифікатор підтвердження.
     * @returns {object} Готовий до серіалізації об'єкт пакету.
     */
    #createPacket(event, data, ackId = null) {
        // Динамічно зчитуємо актуальний список усіх кімнат сокета на цю саму мілісекунду
        const currentRooms = this.rooms.size > 0 ? Array.from(this.rooms) : [this.id]

        const packet = {
            event,
            data,
            meta: {
                id: `msg_${Math.random().toString(36).substring(2, 11)}`, // Унікальний ID повідомлення
                timestamp: Date.now(), // Точний Unix-час сервера
                serverTime: new Date().toISOString(), // ISO рядок часу
                nsp: this.nsp.name, // Простір імен
                rooms: currentRooms, // Набір кімнат сокета
            },
        }

        // Додаємо ackId в корінь пакету лише якщо він переданий (для економії байтів у мережі)
        if (ackId !== null) {
            packet.ackId = ackId
        }

        return packet
    }

    /**
     * Відправляє подію безпосередньо цьому клієнту.
     * @param {string} event - Назва події.
     * @param {any} data - Дані для відправки.
     * @param {Function|null} [ackCallback=null] - Опціональний коллбек для очікування відповіді від клієнта.
     * @returns {boolean} True, якщо пакет успішно надіслано в буфер мережі.
     */
    emit(event, data, ackCallback = null) {
        if (this.rawWs.readyState !== 1) {
            // 1 === WebSocket.OPEN
            this.logger?.warn?.(`Спроба відправити еміт "${event}" у закритий сокет`)
            return false
        }

        // let ackId = null
        // if (typeof ackCallback === 'function') {
        //     ackId = this.#nextAckId()
        //     this.ackCallbacks.set(ackId, ackCallback)
        // }

        // ВИКЛИК ЦЕНТРАЛІЗОВАНОГО МЕТОДУ
        const packet = this.#createPacket(event, data)

        if (typeof ackCallback === 'function') {
            const ackId = this.#nextAckId()
            this.ackCallbacks.set(ackId, ackCallback)
            packet.ackId = ackId
        }

        if (this.isVolatile && this.rawWs.bufferedAmount > 0) {
            this.isVolatile = false // Скидаємо прапор
            this.logger?.debug?.(`Дропнуто volatile пакет "${event}" через забитий буфер`)
            return false
        }

        this.isVolatile = false
        this.rawWs.send(JSON.stringify(packet))
        return true
    }

    /**
     * Запускає еміт події з асинхронним проміс-таймаутом для очікування відповіді (ACK).
     * @param {number} ms - Час очікування в мілісекундах.
     * @returns {{emit: (event: string, data: any) => Promise<any>}}
     */
    timeout(ms) {
        return {
            emit: (event, data) => {
                return new Promise((resolve, reject) => {
                    if (this.rawWs.readyState !== 1) {
                        return reject(new Error('Socket connection is closed'))
                    }

                    const ackId = this.#nextAckId()

                    // ВИКЛИК ЦЕНТРАЛІЗОВАНОГО МЕТОДУ
                    const packet = this.#createPacket(event, data, ackId)

                    const timer = setTimeout(() => {
                        if (this.ackCallbacks.has(ackId)) {
                            this.ackCallbacks.delete(ackId)
                            this.logger?.warn?.(
                                `Acknowledgement для події "${event}" таймаутнувся після ${ms}мс`,
                            )
                            reject(new Error(`Operation timed out after ${ms} ms`))
                        }
                    }, ms)

                    this.ackCallbacks.set(ackId, (resData) => {
                        clearTimeout(timer)
                        resolve(resData)
                    })

                    this.rawWs.send(JSON.stringify(packet))
                })
            },
        }
    }

    /**
     * Надсилає подію на сервер та асинхронно чекає на відповідь (ACK) через Promise.
     * Аналог офіційного emitWithAck з socket.io-client.
     * Має вбудований дефолтний таймаут та повну підтримку офлайн-буферизації.
     *
     * @async
     * @param {string} event - Назва бізнес-події.
     * @param {any} data - Корисне навантаження (payload).
     * @param {number} [timeoutMs=10000] - Максимальний час очікування відповіді (за замовчуванням 10 секунд).
     * @returns {Promise<any>} Результат підтвердження від сервера.
     */
    async emitWithAck(event, data, timeoutMs = 10000) {
        // Просто перевикористовуємо наш надійний і протестований конвеєр timeout()
        return this.timeout(timeoutMs).emit(event, data)
    }

    /**
     * Створює оператор розсилки (Broadcast) від імені цього сокета (виключаючи його самого).
     * @returns {BroadcastOperator}
     */
    get broadcast() {
        return new BroadcastOperator(this.nsp.adapter, this.id)
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

    /**
     * Додає поточний сокет до кімнати.
     * @param {string} roomName
     */
    join(roomName) {
        if (typeof roomName !== 'string') return
        this.nsp.adapter.add(this.id, roomName)
        this.events.emit('join', roomName)
    }

    /**
     * Видаляє поточний сокет із кімнати.
     * @param {string} roomName
     */
    leave(roomName) {
        if (typeof roomName !== 'string') return
        this.nsp.adapter.del(this.id, roomName)
        this.events.emit('leave', roomName)
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
     * Примусово і негайно розриває TCP з'єднання на низькому рівні.
     */
    terminate() {
        this.logger?.warn?.(`Примусове розірвання TCP з'єднання через terminate()`)

        this.#stopHeartbeat()

        if (typeof this.rawWs.terminate === 'function') {
            this.rawWs.terminate()
        } else {
            this.rawWs.close()
        }
    }

    /**
     * Ініціалізує низькорівневий цикл перевірки працездатності (Heartbeat).
     * @private
     */
    #startHeartbeat() {
        this.#stopHeartbeat()

        this.pingTimer = setInterval(() => {
            if (!this.isAlive) {
                this.logger?.warn?.(`Клієнт не відповів на попередній ping. Закриваємо з'єднання.`)
                this.terminate()
                return
            }

            this.isAlive = false

            // Перевіряємо, чи підтримує сирий сокет нативний метод ping (бібліотека ws)
            if (typeof this.rawWs.ping === 'function') {
                this.rawWs.ping()
            } else {
                // Фолбек для uWebSockets або кастомних обгорток — шлемо пустий системний пакет
                this.emit('__ping', {})
            }
        }, this.pingIntervalMs)
    }

    /**
     * Оновлює мітку активності клієнта та перезапускає таймаут наступного пінгу.
     * @private
     */
    #refreshHeartbeat() {
        this.isAlive = true
        this.lastActivity = Date.now()

        this.#stopHeartbeat()

        this.pingTimer = setTimeout(() => {
            this.#pingInbound()
        }, this.pingIntervalMs)
    }

    /**
     * Основний атомарний цикл відправки нативного Ping.
     * Клієнт Має відповісти за час, рівний pingIntervalMs.
     * @private
     */
    #pingInbound() {
        this.#stopHeartbeat()

        if (this.rawWs.readyState !== 1) return

        // 1. Надсилаємо нативний низькорівневий фрейм
        if (typeof this.rawWs.ping === 'function') {
            this.rawWs.ping()
        } else {
            this.emit('__ping', {})
        }

        // 2. Включаємо залізобетонний лічильник очікування
        this.pingTimer = setTimeout(() => {
            this.logger?.warn?.(
                `Клієнт не повернув нативний PONG за ${this.pingIntervalMs}мс. Примусове закриття.`,
            )
            this.terminate()
        }, this.pingIntervalMs)
    }

    /**
     * Зупиняє цикл перевірки працездатності сокета.
     * @private
     */
    #stopHeartbeat() {
        if (this.pingTimer) {
            clearInterval(this.pingTimer)
            clearTimeout(this.pingTimer)
            this.pingTimer = null
        }
    }

    /**
     * Ініціалізує низькорівневі слухачі. Щоразу оновлює мітку activity,
     * що дозволяє серверу розуміти, що клієнт живий, БЕЗ відправки зайвих пінгів.
     * @private
     */
    #initListeners() {
        // Успішна відповідь на ping від клієнта
        this.rawWs.on('pong', () => {
            // Якщо ми увімкнули режим симуляції смерті — сервер вдає,
            // що він нічого не отримав і ПОВНІСТЮ ІГНОРУЄ PONG.
            if (this?.isSimulatingDeath) {
                this.logger?.warn?.(
                    `[TEST] Нативний PONG отримано, але ми його ІГНОРУЄМО для імітації обриву!`,
                )
                return // Перериваємо виконання! Таймер смерті НЕ СКИДАЄТЬСЯ.
            }

            this.#refreshHeartbeat()
        })

        // Слухач нашого кастомного системного pong-сигналу (для не-нативних середовищ)
        this.on('__pong', () => {
            this.#refreshHeartbeat()
        })

        this.rawWs.on('message', (message) => {
            this.#refreshHeartbeat()

            // Подія 'message' потрібна, тільки якщо десь ззовні ДІЙСНО потрібні сирі дані
            this.events.emit('message', message)

            try {
                const parsed = JSON.parse(message)
                this.events.emit('incoming_message', parsed)

                // Сценарій 1: Клієнт повернув відповідь (ACK) на наш раніше надісланий запит
                if (parsed.isAckResponse) {
                    const cb = this.ackCallbacks.get(parsed.ackId)
                    if (cb) {
                        cb(parsed.data)
                        this.ackCallbacks.delete(parsed.ackId)
                    }
                    return
                }

                // Сценарій 2: Клієнт надіслав нову бізнес-подію
                if (parsed.event) {
                    let respondFunc = null

                    // Якщо клієнт очікує підтвердження (ACK) для цієї події, формуємо для нього функцію-відповідь
                    if (parsed.ackId) {
                        respondFunc = (resData) => {
                            if (this.rawWs.readyState === 1) {
                                this.rawWs.send(
                                    JSON.stringify({
                                        isAckResponse: true,
                                        ackId: parsed.ackId,
                                        data: resData,
                                    }),
                                )
                            }
                        }
                    }

                    //
                    this.events.emit(parsed.event, parsed.data, respondFunc)
                }
            } catch (err) {
                this.logger?.error?.(`Помилка парсингу або обробки пакету: ${err.message}`)
            }
        })

        this.rawWs.on('close', (code, rawReason) => {
            // Якщо прилетів Buffer, перетворюємо у string, інакше залишаємо як є
            const reason = Buffer.isBuffer(rawReason) ? rawReason.toString('utf8') : rawReason

            this.logger?.info?.(`Фізичне з'єднання закрилося (Код: ${code})`)
            this.#stopHeartbeat()
            this.ackCallbacks.clear()

            // Фіксуємо набір кімнат безпосередньо ПЕРЕД очищенням для події disconnecting
            const activeRoomsBeforeCleanup = new Set(this.rooms)
            this.events.emit('disconnecting', activeRoomsBeforeCleanup)

            if (this.nsp?.globalEvents) {
                this.nsp.globalEvents.emit('disconnecting', {
                    socket: this,
                    rooms: activeRoomsBeforeCleanup,
                })
            }

            // Запускаємо відкладене очищення кімнат (Grace Period) в адаптері
            const gracePeriod = this.nsp?.serverOptions?.gracePeriodMs || 0
            this.nsp.adapter.delAll(this.id, gracePeriod, () => {
                this.logger?.info?.(`Остаточне очищення сокета завершено після періоду грації`)
                this.events.emit('disconnect', { code, reason })

                if (this.nsp?.globalEvents) {
                    this.nsp.globalEvents.emit('disconnect', { socketId: this.id, code, reason })
                }
            })
        })

        // Захист від непередбачуваних системних помилок на TCP-сокеті
        this.rawWs.on('error', (error) => {
            this.logger?.error?.(`Системна помилка TCP-з'єднання:`, error)
            this.terminate()
        })
    }
}
