import crypto from 'crypto'

/**
 * Клас Room забезпечує високопродуктивне керування групою з'єднань у межах неймспейсу.
 * Реалізує стратегію Batching (групування повідомлень) для мінімізації системних викликів
 * та використовує розподілений стан для масштабування в межах кластера.
 * Реалізує патерн Pub/Sub між серверами та розсилку клієнтам.
 */
export class Room {
    /**
     * Створює екземпляр кімнати з підтримкою черги відправки та брокера.
     * @param {string} name - Унікальне ім'я кімнати в межах неймспейсу.
     * @param {import('./Namespace').Namespace} ns - Екземпляр батьківського неймспейсу.
     */
    constructor(name, ns) {
        /**
         * Назва кімнати.
         * @type {string}
         */
        this.name = name

        /**
         * Посилання на батьківський неймспейс.
         * @type {import('./Namespace').Namespace}
         */
        this.ns = ns

        /**
         * Топік для публікації та підписки в Message Broker.
         * @type {string}
         */
        this.topic = `broker:${this.ns.name}:${this.name}`

        /**
         * Зберігає унікальні ID сокетів, підключених до цієї кімнати на ПОТОЧНОМУ сервері.
         * Використання Set запобігає дублюванню при повторних запитах join.
         * @type {Set<string>}
         * @private
         */
        this._localSockets = new Set()

        /**
         * Функція для скасування підписки на брокер (Redis/NATS/etc).
         * @type {Function|null}
         * @private
         */
        this._unsubBroker = null

        /**
         * Черга для накопичення повідомлень перед груповою відправкою (Batching).
         * @type {Array<{envelope: Object, exceptId: string|null}>}
         * @private
         */
        this._batchQueue = []

        /**
         * Таймер для виконання чергової групової відправки.
         * @type {ReturnType<setTimeout>|null}
         * @private
         */
        this._batchTimer = null

        /**
         * Інтервал збору повідомлень у мілісекундах.
         * 20мс забезпечує баланс між низькою затримкою та ефективністю CPU.
         * @type {number}
         * @private
         */
        this._batchInterval = 20

        /** @type {object|undefined} */
        this.logger = this.ns.logger
    }

    /**
     * Повертає кількість унікальних локальних підключень.
     * @returns {number}
     */
    get localConnectionsCount() {
        return this._localSockets.size
    }

    /**
     * Додає сокет до кімнати та ініціалізує міжсерверну підписку, якщо це перший локальний клієнт.
     * @param {string} socketId - Ідентифікатор сокета.
     * @returns {Promise<void>}
     */
    async join(socketId) {
        try {
            // Перевірка на вже існуюче підключення (ідемпотентність)
            if (this._localSockets.has(socketId)) {
                return
            }

            // Зберігаємо стан у розподіленому сховищі (напр. Redis)
            await this.ns.state.addUserToRoom(this.ns.name, this.name, socketId)

            // Додаємо в локальний реєстр
            this._localSockets.add(socketId)

            // Якщо це перший локальний клієнт — підписуємось на події від інших серверів
            if (this._localSockets.size === 1) {
                await this._subscribeToBroker()
            }

            this.logger?.debug(
                `[${this.ns.name}][${this.name}] Сокет ${socketId} додано. Локальних клієнтів: ${this._localSockets.size}`,
            )
        } catch (error) {
            this.logger?.error(
                `[${this.ns.name}][${this.name}] Помилка приєднання: ${error.message}`,
            )
            throw error
        }
    }

    /**
     * Видаляє сокет з кімнати та знищує об'єкт кімнати, якщо вона порожня.
     * @param {string} socketId - Ідентифікатор сокета.
     * @returns {Promise<void>}
     */
    async leave(socketId) {
        try {
            if (!this._localSockets.has(socketId)) {
                return
            }

            await this.ns.state.removeUserFromRoom(this.ns.name, this.name, socketId)

            this._localSockets.delete(socketId)

            this.logger?.debug(
                `[${this.ns.name}][${this.name}] Сокет ${socketId} вийшов. Локальних клієнтів: ${this._localSockets.size}`,
            )

            // Якщо локальних клієнтів не залишилось — відписуємось від брокера
            if (this._localSockets.size <= 0) {
                await this.destroy()
            }
        } catch (error) {
            this.logger?.error(`[${this.ns.name}][${this.name}] Помилка виходу: ${error.message}`)
        }
    }

    /**
     * Надсилає повідомлення всім учасникам кімнати (локальним та на інших серверах).
     * @param {Object} options - Параметри повідомлення.
     * @param {string} options.type - Тип події (напр. 'MESSAGE_NEW', 'USER_TYPING').
     * @param {Object} options.payload - Дані повідомлення.
     * @param {Object|null} [options.sender] - Об'єкт з даними відправника (id, name, avatar тощо).
     * @param {string|null} [options.exceptId] - ID сокета, який потрібно виключити з розсилки.
     * @returns {Promise<void>}
     */
    async emit({ type, payload, sender = null, exceptId = null }) {
        /**
         * Стандартизований конверт повідомлення (Envelope).
         * @type {Object}
         */
        const envelope = {
            id: crypto.randomUUID(),
            ns: this.ns.name,
            room: this.name,
            type: type,
            timestamp: Date.now(),
            sender: sender,
            payload: payload,
            meta: {
                traceId: this.ns.generateTraceId?.(), // Підтримка розподіленого трасування (OpenTelemetry)
            },
        }

        // 1. Трансляція іншим вузлам через брокер
        try {
            await this.ns.broker.publish(this.topic, {
                envelope,
                exceptId,
                origin: this.ns.serverId, // Захист від циклічної розсилки (echo)
            })
        } catch (error) {
            this.logger?.error(`[${this.topic}] Помилка публікації в брокер: ${error.message}`)
        }

        // 1. Трансляція іншим вузлам через брокер
        this._enqueueLocalEmit(envelope, exceptId)
    }

    /**
     * Додає повідомлення до локальної черги відправки.
     * @param {Object} envelope - Сформований пакет даних.
     * @param {string|null} exceptId - ID сокета-виключення.
     * @private
     */
    _enqueueLocalEmit(envelope, exceptId) {
        this._batchQueue.push({ envelope, exceptId })

        if (!this._batchTimer) {
            this._batchTimer = setTimeout(() => this._flushBatch(), this._batchInterval)
        }
    }

    /**
     * Виконує масову відправку повідомлень із черги всім локальним клієнтам.
     * Це суттєво знижує навантаження на подієвий цикл (Event Loop).
     * @private
     * @returns {Promise<void>}
     */
    async _flushBatch() {
        const currentBatch = [...this._batchQueue]
        this._batchQueue = []

        this._clearBatchTimer()

        if (currentBatch.length === 0) return

        try {
            // Отримуємо список ID сокетів у цій кімнаті з розподіленого стану
            const clientIds = await this.ns.state.getClientsInRoom(this.ns.name, this.name)

            for (const socketId of clientIds) {
                // Перевіряємо, чи сокет не є виключенням та чи він підключений до цього сервера
                const connection = this.ns.connections.get(socketId)
                if (!connection) continue

                // Фільтруємо повідомлення, які не призначені для цього сокета
                const messagesForSocket = currentBatch
                    .filter((item) => item.exceptId !== socketId)
                    .map((item) => item.envelope)

                if (messagesForSocket.length > 0) {
                    // Якщо повідомлення одне — надсилаємо об'єкт, якщо кілька — масив (Batch)
                    const output =
                        messagesForSocket.length === 1
                            ? messagesForSocket[0]
                            : { type: 'BATCH_PACKAGE', items: messagesForSocket }

                    // Надсилаємо дані
                    connection.send(output)
                }
            }
        } catch (error) {
            this.logger?.error(`[${this.ns.name}][${this.name}] Помилка Flush: ${error.message}`)
        }
    }

    /**
     * Зупиняє таймер групової відправки та скидає його стан.
     * @private
     */
    _clearBatchTimer() {
        if (this._batchTimer) {
            clearTimeout(this._batchTimer)
            this._batchTimer = null
        }
    }

    /**
     * Підписується на топік у брокері для отримання повідомлень від інших серверів.
     * @private
     * @returns {Promise<void>}
     */
    async _subscribeToBroker() {
        this.logger?.debug(`[${this.ns.name}][${this.name}] Підписка на брокер: ${this.topic}`)

        this._unsubBroker = await this.ns.broker.subscribe(this.topic, async (packet) => {
            // Ігноруємо пакет, якщо він прийшов з цього ж сервера
            // Захист від само-підписки (echo)
            if (packet.origin === this.ns.serverId) return

            // Навіть зовнішні повідомлення проходять через Batching для стабільності клієнта
            this._enqueueLocalEmit(packet.envelope, packet.exceptId)
        })
    }

    /**
     * Деактивує підписку на брокер.
     * @private
     * @returns {Promise<void>}
     */
    async _unsubscribeFromBroker() {
        if (this._unsubBroker) {
            this.logger?.debug(`[${this.ns.name}][${this.name}] Скасування підписки на брокер`)
            await this._unsubBroker()
            this._unsubBroker = null
        }
    }

    /**
     * Повне очищення ресурсів кімнати та видалення її з реєстру.
     * @returns {Promise<void>}
     */
    async destroy() {
        this._clearBatchTimer()
        await this._unsubscribeFromBroker()

        this._localSockets.clear()
        this.ns.roomsMap.delete(this.name)

        this.logger?.info(`[${this.ns.name}][${this.name}] Кімнату знищено`)
    }
}
