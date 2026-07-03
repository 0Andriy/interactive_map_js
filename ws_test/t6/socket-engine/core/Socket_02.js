import { EventBus } from './EventBus.js'
import { BroadcastOperator } from './BroadcastOperator.js'

/**
 * @typedef {Object} SocketHandshake
 * @property {Object} headers - Заголовки HTTP запиту при з'єднанні.
 * @property {string} query - Рядок запиту (Query string).
 * @property {string} address - IP адреса клієнта.
 * @property {boolean} secure - Чи використовується SSL/TLS (https/wss).
 */

/**
 * @typedef {Object} ServerOptions
 * @property {number} [pingIntervalMs=25000] - Інтервал між відправкою ping пакетів.
 * @property {number} [pingTimeoutMs=20000] - Час очікування pong відповіді перед розривом.
 */

/**
 * @typedef {Object} NamespaceAdapter
 * @property {Map<string, Set<string>>} sids - Мапа відповідності Socket ID -> Кімнати.
 * @property {function(string, string): void} add - Метод додавання сокета в кімнату.
 * @property {function(string, string): void} del - Метод видалення сокета з кімнати.
 */

/**
 * @typedef {Object} Namespace
 * @property {string} name - Ім'я простору назв.
 * @property {NamespaceAdapter} adapter - Адаптер для керування кімнатами та розподілу повідомлень.
 * @property {ServerOptions} [serverOptions] - Конфігураційні параметри сервера.
 */

/**
 * @typedef {Object} Logger
 * @property {function(string, ...*): void} info - Логування інформаційних повідомлень.
 * @property {function(string, ...*): void} warn - Логування попереджень.
 * @property {function(string, ...*): void} error - Логування критичних помилок.
 * @property {function(string, ...*): void} debug - Налагоджувальні логи для трасування.
 * @property {function(Object): Logger} [child] - Створення дочірнього логера з контекстом.
 */

/**
 * @typedef {Object} PacketMeta
 * @property {string} id - Унікальний інкрементальний ID повідомлення для дедуплікації.
 * @property {number} timestamp - Unix-час створення пакету на сервері.
 * @property {number} serverTime - Дублюючий числовий час для усунення алокацій ISO-рядків.
 * @property {string} nsp - Простір назв, до якого належить повідомлення.
 * @property {string[]} rooms - Масив кімнат, у які транслюється пакет.
 */

/**
 * @typedef {Object} SocketPacket
 * @property {string} event - Назва події.
 * @property {*} data - Корисне навантаження (payload).
 * @property {PacketMeta} meta - Метадані пакета для моніторингу та трекінгу.
 * @property {number} [ackId] - ID для підтвердження доставки (якщо передбачено).
 */

/**
 * Клас керування високозавантаженим WebSocket-з'єднанням.
 * Оптимізовано для мінімального навантаження на Garbage Collector та захисту від витоків пам'яті.
 */
export class Socket {
    /** @type {Object} Нативний інстанс WebSocket з'єднання (ws або uWebSockets) */
    #rawSocket
    /** @type {Namespace} Простір назв, до якого прикріплений сокет */
    #namespace
    /** @type {EventBus} Локальна шина подій для обробки колбеків */
    #eventBus
    /** @type {Logger} Інструмент логування з контекстом сокета */
    #logger

    /** @type {Map<number, function(*): void>} Колекція активних колбеків очікування підтвердження (ACK) */
    #acknowledgements = new Map()
    /** @type {number} Інкрементальний лічильник для ID підтверджень */
    #ackCounter = 0
    /** @type {number} Інкрементальний лічильник для унікальних ID повідомлень */
    #messageCounter = 0

    /** @type {NodeJS.Timeout|null} Таймер очікування наступного циклу перевірки активності */
    #heartbeatTimer = null
    /** @type {NodeJS.Timeout|null} Таймер очікування PONG відповіді клієнта (таймаут) */
    #disconnectTimer = null

    /** @type {number} Інтервал між піками активності в мілісекундах */
    #pingIntervalMs
    /** @type {number} Максимальний час очікування відповіді в мілісекундах */
    #pingTimeoutMs
    /** @type {number} Unix-timestamp останньої зафіксованої активності клієнта */
    #lastActivityTimestamp
    /** @type {boolean} Прапорець, що відображає поточний статус мережевої активності сокета */
    #isConnectionAlive = true
    /** @type {boolean} Якщо true, наступний пакет буде скинуто у разі переповнення буфера (Backpressure) */
    #isNextEmitVolatile = false
    /** @type {boolean} Допоміжний прапорець для імітації обривів зв'язку у тестах */
    isSimulatingDeath = false

    /**
     * Створює екземпляр Socket.
     * @param {Object} rawSocket - Нативний об'єкт WebSocket.
     * @param {string} socketId - Унікальний ідентифікатор клієнтської сесії.
     * @param {Namespace} namespace - Інстанс простору назв.
     * @param {SocketHandshake} handshake - Дані первинного рукостискання (HTTP Handshake).
     * @param {Logger} [logger=null] - Інстанс логера.
     */
    constructor(rawSocket, socketId, namespace, handshake, logger = null) {
        this.#rawSocket = rawSocket
        this.id = socketId
        this.#namespace = namespace
        this.handshake = handshake

        this.#logger = logger?.child?.({ component: '[WS Socket]', socketId: this.id }) ??
            logger ?? {
                info: () => {},
                warn: () => {},
                error: () => {},
                debug: () => {},
            }

        this.#eventBus = new EventBus({ logger: this.#logger })

        const serverOptions = this.#namespace?.serverOptions
        this.#pingIntervalMs = serverOptions?.pingIntervalMs || 25000
        this.#pingTimeoutMs = serverOptions?.pingTimeoutMs || 20000
        this.#lastActivityTimestamp = Date.now()

        this.#initializeListeners()
        this.#startInboundPingChain()
    }

    /**
     * Повертає список кімнат, у яких зараз перебуває цей сокет.
     * @returns {Set<string>} Множина унікальних імен кімнат.
     */
    get rooms() {
        return this.#namespace.adapter.sids.get(this.id) || new Set()
    }

    /**
     * Переводить сокет у режим "volatile" для наступного виклику emit.
     * Пакет буде проігноровано, якщо буфер відправки заповнений.
     * @returns {this}
     */
    get volatile() {
        this.#isNextEmitVolatile = true
        return this
    }

    /**
     * Дозволяє створювати трансляції (broadcast) усім, крім поточного сокета.
     * @returns {BroadcastOperator}
     */
    get broadcast() {
        return new BroadcastOperator(this.#namespace.adapter, this.id)
    }

    /**
     * Реєструє обробник на певну подію від клієнта.
     * @param {string} event - Назва події.
     * @param {function(*): void} callback - Функція обробник.
     */
    on(event, callback) {
        this.#eventBus.on(event, callback)
    }

    /**
     * Додає сокет до вказаної кімнати через внутрішній адаптер.
     * @param {string} roomName - Назва кімнати.
     */
    join(roomName) {
        if (typeof roomName !== 'string' || !roomName) return
        this.#namespace.adapter.add(this.id, roomName)
        this.#eventBus.emit('join', roomName)
    }

    /**
     * Видаляє сокет із вказаної кімнати.
     * @param {string} roomName - Назва кімнати.
     */
    leave(roomName) {
        if (typeof roomName !== 'string' || !roomName) return
        this.#namespace.adapter.del(this.id, roomName)
        this.#eventBus.emit('leave', roomName)
    }

    /**
     * Перевіряє, чи входить сокет до вказаної кімнати.
     * @param {string} roomName - Назва кімнати для перевірки.
     * @returns {boolean} True, якщо сокет є учасником кімнати.
     */
    hasRoom(roomName) {
        if (typeof roomName !== 'string' || !roomName.trim()) return false
        return this.rooms.has(roomName)
    }

    /**
     * Таргетує наступну трансляцію повідомлення у конкретну кімнату.
     * @param {string} roomName - Назва кімнати.
     * @returns {BroadcastOperator}
     */
    to(roomName) {
        return new BroadcastOperator(this.#namespace.adapter, this.id).to(roomName)
    }

    /**
     * Синонім до методу .to(roomName).
     * @param {string} roomName - Назва кімнати.
     * @returns {BroadcastOperator}
     */
    in(roomName) {
        return this.to(roomName)
    }

    /**
     * Відправляє подію безпосередньо поточному клієнту.
     * @param {string} event - Назва події.
     * @param {*} data - Корисні дані (payload) будь-якого типу, що серіалізується в JSON.
     * @param {function(*): void} [ackCallback=null] - Опціональний колбек для підтвердження отримання клієнтом.
     * @returns {boolean} Статус успішності відправки пакету в системний буфер.
     */
    emit(event, data, ackCallback = null) {
        if (this.#rawSocket.readyState !== 1) {
            this.#logger.warn(`[Emit] Спроба відправки події "${event}" у закритий сокет`)
            this.#isNextEmitVolatile = false
            return false
        }

        if (this.#isNextEmitVolatile && this.#rawSocket.bufferedAmount > 0) {
            this.#logger.debug(
                `[Emit] Дропнуто volatile пакет "${event}" через переповнення буфера`,
            )
            this.#isNextEmitVolatile = false
            return false
        }

        this.#isNextEmitVolatile = false

        let ackId = null
        if (typeof ackCallback === 'function') {
            ackId = this.#generateAckId()
            this.#acknowledgements.set(ackId, ackCallback)
        }

        const packet = this.#buildPacket(event, data, ackId)

        try {
            this.#rawSocket.send(JSON.stringify(packet))
            return true
        } catch (error) {
            if (ackId) this.#acknowledgements.delete(ackId)
            this.#logger.error(`[Emit] Помилка серіалізації/відправки події "${event}":`, error)
            return false
        }
    }

    /**
     * Повертає проксі-об'єкт для реалізації еміту з лімітом часу на відповідь (таймаутом).
     * @param {number} ms - Максимальний час очікування відповіді від клієнта в мс.
     * @returns {{emit: function(string, *): Promise<*>}} Об'єкт із асинхронним методом emit.
     */
    timeout(ms) {
        return {
            emit: (event, data) =>
                new Promise((resolve, reject) => {
                    if (this.#rawSocket.readyState !== 1) {
                        return reject(new Error('Socket connection is closed'))
                    }

                    const ackId = this.#generateAckId()
                    const packet = this.#buildPacket(event, data, ackId)
                    const expirationTimer = setTimeout(() => {
                        if (this.#acknowledgements.has(ackId)) {
                            this.#acknowledgements.delete(ackId)
                            this.#logger.warn(
                                `[Timeout] Ack для події "${event}" таймаутнувся після ${ms}мс`,
                            )
                            reject(new Error(`Operation timed out after ${ms} ms`))
                        }
                    }, ms)
                    this.#acknowledgements.set(ackId, (responseData) => {
                        clearTimeout(expirationTimer)
                        resolve(responseData)
                    })
                    try {
                        this.#rawSocket.send(JSON.stringify(packet))
                    } catch (error) {
                        clearTimeout(expirationTimer)
                        this.#acknowledgements.delete(ackId)
                        reject(error)
                    }
                }),
        }
    }

    /**
     * Асинхронний еміт події, що повертає Promise та очікує на підтвердження (ACK) від клієнта.
     * @param {string} event - Назва події.
     * @param {} data - Дані відправки.
     * @param {number} [timeoutMs=10000] - Максимальний ліміт очікування відповіді.
     * @returns {Promise<>} Повертає дані, надіслані клієнтом у відповідь.
     */
    async emitWithAck(event, data, timeoutMs = 10000) {
        return this.timeout(timeoutMs).emit(event, data)
    }

    /**
     * Примусово розриває TCP/WebSocket з'єднання на низькому рівні.
     * Викликає моментальне закриття з'єднання без очікування фінальних хендшейків.
     */
    terminate() {
        this.#logger.warn(`Примусове розірвання TCP з'єднання для сокета: ${this.id}`)
        this.#clearAllTimers()
        if (typeof this.#rawSocket.terminate === 'function') {
            this.#rawSocket.terminate()
        } else {
            this.#rawSocket.close()
        }
    }

    /**
     * ПОВНИЙ МЕТОД ЖИТТЄВОГО ЦИКЛУ (Destructor / Lifecycle Terminator)
     * Викликається для повної деалокації пам'яті, коли сокет закрився.
     * Запобігає утворенню Memory Leaks у V8 engine.
     */
    destroy() {
        this.#logger.debug(`[Lifecycle] Виклик повного знищення та деалокації сокета: ${this.id}`)
        // 1. Зупиняємо всі активні таймери (щоб Event Loop не тримав посилання на сокет)
        this.#clearAllTimers()
        // 2. Очищаємо всі очікування ACK (звільняємо пам'ять від «підвішених» функцій-колбеків)
        this.#acknowledgements.clear()
        // 3. Звільняємо шину подій та знімаємо слухачі
        if (this.#eventBus && typeof this.#eventBus.removeAllListeners === 'function') {
            this.#eventBus.removeAllListeners()
        }
        // 4. Очищаємо посилання на системні події нативного сокета
        if (this.#rawSocket) {
            try {
                this.#rawSocket.removeAllListeners?.('message')
                this.#rawSocket.removeAllListeners?.('pong')
                this.#rawSocket.removeAllListeners?.('close')
                this.#rawSocket.on('error', () => {})
                // Заглушка, щоб уникнути uncaught exceptions у процесі вмирання
                this.#rawSocket.removeAllListeners?.('error')
            } catch (e) {
                this.#logger.error(
                    '[Lifecycle Destroy Error] Помилка очищення лісенерів сокета:',
                    e,
                )
            }
        }
        // 5. Видаляємо сокет із кімнат у локальному адаптері (якщо він там залишився)
        if (this.#namespace?.adapter?.sids?.has(this.id)) {
            const currentRooms = this.rooms
            for (const room of currentRooms) {
                this.#namespace.adapter.del(this.id, room)
            }
        }
        // 6. Обнуляємо посилання на великі об'єкти, щоб Garbage Collector миттєво їх зібрав
        this.#rawSocket = null
        this.#namespace = null
        this.#eventBus = null
        this.#logger = null
    }

    /**
     * Генерує інкрементальний ID для підтверджень повідомлень.
     * @returns {number}
     */
    #generateAckId() {
        if (this.#ackCounter >= Number.MAX_SAFE_INTEGER) {
            this.#ackCounter = 0
        }
        return ++this.#ackCounter
    }

    /**
     * Генерує унікальний інкрементальний ID для метаданих повідомлення.
     * @returns {number}
     */
    #generateMessageId() {
        if (this.#messageCounter >= Number.MAX_SAFE_INTEGER) {
            this.#messageCounter = 0
        }
        return ++this.#messageCounter
    }

    /**
     * Збирає фінальний пакет перед серіалізацією. Оптимізовано за ресурсами процесора.
     * @param {string} event - Назва події.
     * @param {*} data - Навантаження.
     * @param {number|null} [ackId=null] - ID підтвердження події.
     * @returns {SocketPacket} Сформована структура об'єкта.
     */
    #buildPacket(event, data, ackId = null) {
        const roomsArray = this.rooms.size > 0 ? Array.from(this.rooms) : [this.id]
        const now = Date.now()
        const packet = {
            event,
            data,
            meta: {
                id: `m_${this.id}_${this.#generateMessageId()}`,
                timestamp: now,
                serverTime: now,
                nsp: this.#namespace.name,
                rooms: roomsArray,
            },
        }
        if (ackId !== null) {
            packet.ackId = ackId
        }
        return packet
    }
    /*** Оновлює прапорці активності та перезапускає цикл очікування наступного пінг-запиту.*/
    #refreshHeartbeat() {
        this.#isConnectionAlive = truethis.#lastActivityTimestamp = Date.now()
        this.#clearAllTimers()
        this.#heartbeatTimer = setTimeout(() => {
            this.#startInboundPingChain()
        }, this.#pingIntervalMs)
    }
    /*** Надсилає PING клієнту та запускає таймер жорсткого очікування відповіді.*/
    #startInboundPingChain() {
        this.#clearAllTimers()
        if (this.#rawSocket.readyState !== 1) return
        if (typeof this.#rawSocket.ping === 'function') {
            this.#rawSocket.ping()
        } else {
            this.emit('__ping', {})
        }
        this.#disconnectTimer = setTimeout(() => {
            this.#logger.warn(
                `Клієнт ${this.id} не повернув PONG за ${this.#pingTimeoutMs}мс. Закриття з'єднання.`,
            )
            this.terminate()
        }, this.#pingTimeoutMs)
    }
    /*** Надійно очищує та обнуляє системні таймери Event Loop Node.js.*/
    #clearAllTimers() {
        if (this.#heartbeatTimer) {
            clearTimeout(this.#heartbeatTimer)
            this.#heartbeatTimer = null
        }
        if (this.#disconnectTimer) {
            clearTimeout(this.#disconnectTimer)
            this.#disconnectTimer = null
        }
    }
    /*** Налаштовує первинні низькорівневі слухачі подій для WebSocket-інстансу.*/
    #initializeListeners() {
        this.#rawSocket.on('pong', () => {
            if (this.isSimulatingDeath) {
                this.#logger.warn(`[TEST] Нативний PONG ігнорується (імітація обриву)`)
                return
            }
            this.#refreshHeartbeat()
        })
        this.on('__pong', () => {
            this.#refreshHeartbeat()
        })
        this.#rawSocket.on('message', (rawMessage) => {
            this.#refreshHeartbeat()
            this.#eventBus.emit('message', rawMessage)
            try {
                const parsed = JSON.parse(rawMessage)
                if (!parsed || typeof parsed !== 'object') return
                this.#eventBus.emit('incoming_message', parsed)
                if (parsed.isAckResponse && parsed.ackId) {
                    const callback = this.#acknowledgements.get(parsed.ackId)
                    if (callback) {
                        this.#acknowledgements.delete(parsed.ackId)
                        callback(parsed.data)
                    }
                }
            } catch (error) {
                this.#logger.error(`[Parser] Помилка обробки JSON-структури:`, error)
            }
        })
        // Важливо: При настанні події закриття ми автоматично робимо деструктуризацію сокета
        this.#rawSocket.on('close', () => {
            this.destroy()
        })
        this.#rawSocket.on('error', (error) => {
            this.#logger.error(`[Socket Error] Внутрішній збій сокета:`, error)
            this.terminate()
        })
    }
}
