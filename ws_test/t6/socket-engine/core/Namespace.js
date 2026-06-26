import { EventBus } from './EventBus.js'
import { BroadcastOperator } from './BroadcastOperator.js'

/**
 * Клас, що представляє ізольований простір імен (Namespace).
 * Контролює авторизацію через Middleware, керує підключеними сокетами та глобальними розсилками.
 */
export class Namespace {
    /**
     * Створює екземпляр Namespace.
     * @param {string} name - Назва простору імен (наприклад, '/chat').
     * @param {import('./BaseAdapter.js').BaseAdapter} adapterInstance - Екземпляр адаптера (Memory або Redis).
     * @param {object} serverOptions - Глобальні налаштування сервера (таймаути, грація тощо).
     * @param {any} logger - Базовий логер.
     */
    constructor(name, adapterInstance, serverOptions, logger = null) {
        this.name = name
        this.adapter = adapterInstance
        this.serverOptions = serverOptions

        // Ініціалізація дочірнього логера
        this.logger = logger?.child?.({ component: '[WS Namespace]', nsp: this.name }) ??
            logger ?? {
                info: () => {},
                warn: () => {},
                error: () => {},
                debug: () => {},
            }

        /** @type {Function[]} Масив функцій-посередників для авторизації */
        this.middlewares = []
        this.globalEvents = new EventBus({ logger: this.logger })

        /** @type {Map<string, import('./Socket.js').Socket>} Активні сокети: SocketId -> Socket */
        this.sockets = new Map()

        // Пов'язуємо адаптер з цим екземпляром простору імен
        this.adapter.setNamespace(this)

        this.#initGlobalListeners()
    }

    /**
     * Реєструє функцію-посередник (middleware) для валідації/авторизації нових підключень.
     * @param {Function} fn - Функція виду (socket, next) => {}
     * @returns {this}
     */
    use(fn) {
        if (typeof fn === 'function') {
            this.middlewares.push(fn)
        }
        return this
    }

    /**
     * Підписується на глобальні події цього простору імен (наприклад, 'connection').
     * @param {string} event
     * @param {Function} callback
     */
    on(event, callback) {
        this.globalEvents.on(event, callback)
    }

    /**
     * Робить розсилку усім підключеним клієнтам у цьому просторі імен.
     * @param {string} event
     * @param {any} data
     */
    emit(event, data) {
        return new BroadcastOperator(this.adapter).emit(event, data)
    }

    /**
     * Націлює бродкаст у конкретну кімнату.
     * @param {string} roomName
     * @returns {BroadcastOperator}
     */
    to(roomName) {
        return new BroadcastOperator(this.adapter).to(roomName)
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
     * Додає новий сокет у простір імен та запускає ланцюжок авторизації.
     * Клієнт вважається підключеним ЛИШЕ після успішного виконання всіх middleware.
     * @param {import('./Socket.js').Socket} socket
     */
    addSocket(socket) {
        this.logger?.debug?.(`Запуск авторизаційних перевірок для сокета: ${socket.id}`)
        this.globalEvents.emit('before_connect', socket)

        this.runMiddlewares(socket, (err) => {
            // if (err) {
            //     this.logger?.warn?.(
            //         `Авторизація відхилена для сокета ${socket.id}. Причина: ${err.message}`,
            //     )

            //     // Сповіщаємо внутрішні системи
            //     this.globalEvents.emit('connect_error', { socket, error: err })

            //     // Надсилаємо клієнту офіційну помилку авторизації
            //     socket.emit('connect_error', { message: err.message || 'Unauthorized' })

            //     // М'яко закриваємо сокет
            //     socket.rawWs.close(4401, 'Unauthorized')
            //     return
            // }

            if (err) {
                // БЕЗПЕЧНА НОРМАЛІЗАЦІЯ: Витягуємо ТІЛЬКИ ТЕКСТ помилки.
                // Якщо прилетів складний об'єкт із циклічними посиланнями,
                // .message або ручне приведення до рядка розірве коло і візьме лише текст.
                const errorMessage =
                    err?.message || (typeof err === 'string' ? err : 'Unauthorized')

                this.logger.warn(`Middleware відхилив сокет ${socket.id}. Причина: ${errorMessage}`)

                // Сповіщаємо внутрішні системи, передаючи безпечний рядок замість сирого об'єкта
                this.globalEvents.emit('connect_error', { socket, error: new Error(errorMessage) })

                // Надсилаємо клієнту офіційну помилку авторизації
                socket.emit('connect_error', { message: errorMessage })

                // М'яко закриваємо сокет із кодом 4401
                socket.rawWs.close(4401, 'Unauthorized')
                return
            }

            const { recoverSid, lastMsgId } = socket.handshake
            let isRecovered = false

            // СЕНСАЦІЯ: Намагаємося відновити сесію користувача (Connection Recovery)
            if (recoverSid && this.adapter.sids.has(recoverSid)) {
                this.logger?.info?.(
                    `[Recovery] Перехоплено спробу склеювання сесії з сокетом ${recoverSid}`,
                )

                if (this.adapter.graceTimers.has(recoverSid)) {
                    clearTimeout(this.adapter.graceTimers.get(recoverSid))
                    this.adapter.graceTimers.delete(recoverSid)
                }

                const oldSocketId = recoverSid
                socket.id = oldSocketId // Нове з'єднання успадковує старий ID

                this.sockets.set(oldSocketId, socket)
                this.adapter.registerSocket(socket)
                isRecovered = true

                socket.emit('connect', { socketId: socket.id, recovered: true })

                // Віддаємо пропущені повідомлення з пам'яті
                // БЕЗПЕЧНЕ ВИЗНАЧЕННЯ КІМНАТ КОРИСТУВАЧА ДЛЯ ДОСТАВКИ ОФЛАЙН-ІСТОРІЇ
                // Якщо запис в адаптері з якихось причин зник, беремо порожній Set
                const userRooms = this.adapter.sids.get(oldSocketId) || new Set()
                for (const room of userRooms) {
                    const missedPackets = this.adapter.getMissedMessages(room, lastMsgId)

                    for (const packet of missedPackets) {
                        if (socket.rawWs.readyState === 1) {
                            socket.rawWs.send(JSON.stringify(packet))
                        }
                    }
                }
            }

            // Якщо це нове підключення не відновлення сесії
            if (!isRecovered) {
                // РЕЄСТРАЦІЯ В АДАПТЕРІ: Спершу реєструємо об'єкт сокета в адаптері
                this.adapter.registerSocket(socket)

                // Додаємо в локальну карту активних сокетів простору імен
                this.sockets.set(socket.id, socket)

                // За замовчуванням кожен користувач заходить у кімнату зі своїм власним ID
                socket.join(socket.id)

                this.logger?.info?.(`Сокет ${socket.id} успішно авторизований та підключений.`)

                // НАДСИЛАЄМО СИГНАЛ КЛІЄНТУ: Тепер клієнт на своєму боці знає, що авторизація успішна
                socket.emit('connect', { socketId: socket.id })
            }

            // Тригеримо подію успішного підключення для розробника
            this.globalEvents.emit('connection', socket)
        })
    }

    /**
     * Послідовно виконує всі зареєстровані middleware.
     * @param {import('./Socket.js').Socket} socket
     * @param {Function} callback
     */
    runMiddlewares(socket, callback) {
        let index = 0

        const next = (err) => {
            if (err) return callback(err)

            if (index >= this.middlewares.length) return callback(null)

            const middleware = this.middlewares[index++]
            try {
                middleware(socket, next)
            } catch (err) {
                callback(err)
            }
        }

        next()
    }

    /**
     * Слухає глобальні події адаптера у межах цього простору імен.
     * @private
     */
    #initGlobalListeners() {
        // Коли сокет остаточно відключається і адаптер завершив очищення
        this.globalEvents.on('disconnect', ({ socketId, code, reason }) => {
            const hasDeleted = this.sockets.delete(socketId)
            if (hasDeleted) {
                this.logger?.debug?.(
                    `Сокет ${socketId} видалено зі списку активних підключень namespace`,
                )
            }
        })
    }

    /**
     * Граціозно закриває простір імен, наприклад, при вимкненні всього сервера.
     */
    close() {
        this.logger?.info?.(
            `Коректне закриття простору назв. Кількість активних сокетів: ${this.sockets.size}`,
        )

        this.emit('server_shutdown', {
            message: 'Сервер іде на перезавантаження. Будь ласка, зачекайте.',
        })

        for (const socket of this.sockets.values()) {
            // Щоб примусовий розрив не чекав таймерів грації, скидаємо період у нуль
            if (this.serverOptions) {
                this.serverOptions.gracePeriodMs = 0
            }
            socket.rawWs.close(1012, 'Server shutting down')
        }

        this.sockets.clear()
    }
}
