/**
 * @file Клас для управління логікою кімнат та розсилкою повідомлень.
 * @module core/Room
 */

/**
 * @typedef {import('./Socket.js').Socket} Socket
 * @typedef {import('./Namespace.js').Namespace} Namespace
 * @typedef {import('./MessageEnvelope.js').MessageEnvelopeDTO} MessageEnvelopeDTO
 */

/**
 * Представляє кімнату (групу сокетів).
 * Забезпечує координацію між локальними підключеннями та глобальним брокером.
 *
 * @class Room
 */
export class Room {
    /**
     * @param {string} name - Назва кімнати.
     * @param {Namespace} namespace - Батьківський простір імен.
     */
    constructor(name, namespace) {
        /**
         * Назва кімнати.
         * @type {string}
         */
        this.name = name

        /**
         * Батьківський простір імен.
         * @type {Namespace}
         */
        this.ns = namespace

        /** Інстанс логера.
         * @type {import('../interfaces/Logger.js').Logger}
         */
        this.logger = namespace.logger.child
            ? namespace.logger.child({ room: name })
            : namespace.logger

        /**
         * Набір локальних сокетів, підключених до цієї ноди.
         * @type {Set<Socket>}
         * @private
         */
        this._localSockets = new Set()

        /**
         * Топік для брокера подій (горизонтальне масштабування).
         * @type {string}
         */
        this.topic = `broker:ns:${this.ns.name}:room:${this.name}`

        /** Позначка знищення кімнати.
         * @type {boolean}
         * @private
         */
        this._isDestroyed = false

        /** Позначка підписки на брокер.
         * @type {boolean}
         * @private
         */
        this._isSubscribed = false

        /** Час створення кімнати.
         * @type {number}
         */
        this.createdAt = Date.now()

        this.logger?.info('Room instance created', {
            topic: this.topic,
            createdAt: this.createdAt,
        })
    }

    /**
     * Повертає true, якщо в кімнаті немає локальних сокетів.
     * @returns {boolean}
     * @example
     * const empty = room.isEmpty;
     */
    get isEmpty() {
        return this._localSockets.size === 0
    }

    /**
     * Повертає час існування кімнати в мілісекундах.
     * @returns {number}
     * @example
     * const uptime = room.uptime;
     */
    get uptime() {
        return Date.now() - this.createdAt
    }

    /**
     * Повертає загальну кількість учасників кімнати (всіх нод).
     * @returns {Promise<number>}
     * @example
     * const count = await room.getMemberCount();
     */
    async getMemberCount() {
        try {
            // Запит до глобального стану (напр. Redis), де зберігаються всі ID учасників
            return await this.ns.state.getCountInRoom(this.ns.name, this.name)
        } catch (error) {
            this.logger?.error('Failed to get global member count', { error: error.message })
            return this._localSockets.size // Fallback до локальних даних
        }
    }

    /**
     * Додає сокет до кімнати локально та оновлює глобальний стан.
     * @param {Socket} socket - Екземпляр сокета.
     * @returns {Promise<void>}
     * @example
     * await room.add(socket);
     */
    async add(socket) {
        if (this._isDestroyed) return
        if (this._localSockets.has(socket)) return

        try {
            // АКТИВАЦІЯ ПІДПИСКИ: Тільки якщо це перший локальний користувач
            if (this._localSockets.size === 0 && !this._isSubscribed) {
                await this._subscribeToBroker()
            }

            // Додавання локального сокета
            this._localSockets.add(socket)

            // Оновлення глобального стану (Redis/Shared State)
            await this.ns.state.addUserToRoom(this.ns.name, this.name, socket.id)

            this.logger?.debug('Socket added to room', {
                socketId: socket.id,
                countActiveLocalSockets: this._localSockets.size,
            })
        } catch (error) {
            this.logger?.error('Failed to add socket to room', {
                socketId: socket.id,
                error: error.message,
            })

            // Якщо підписка не вдалася, ми не додаємо юзера і чистимо підписку, якщо вона була ініційована
            if (this._localSockets.size === 0) {
                await this._unsubscribeFromBroker()
            }

            throw error
        }
    }

    /**
     * Видаляє сокет з кімнати.
     * @param {Socket} socket - Екземпляр сокета.
     * @returns {Promise<void>}
     * @example
     * await room.remove(socket);
     */
    async remove(socket) {
        // Перевірка, чи сокет взагалі був у цій кімнаті
        if (!this._localSockets.has(socket)) return

        // 1. Видаляємо сокет з локального Set
        this._localSockets.delete(socket)

        // 2. Оновлюємо стан у Redis/DB (глобальний стан)
        try {
            await this.ns.state.removeUserFromRoom(this.ns.name, this.name, socket.id)
        } catch (error) {
            this.logger.error('State removal failed', { error: error.message })
        }

        this.logger?.debug('Socket removed from room', {
            socketId: socket.id,
            countActiveLocalSockets: this._localSockets.size,
        })

        // 3. ПІДПИСКА: Відписуємось від брокера, тільки якщо сокетів 0
        if (this.isEmpty) {
            this.logger?.info('No local users remaining. Deactivating room broker subscription.')
            await this._unsubscribeFromBroker()
        }
    }

    /**
     * Публікує повідомлення в кімнату (на всі сервери через брокер).
     * @param {MessageEnvelopeDTO} envelope - Конверт повідомлення.
     * @param {string|null} enderSocketId - Ідентифікатор сокета-відправника (для захисту від Echo).
     * @returns {Promise<void>}
     * @example
     * await room.broadcast(envelope);
     */
    async broadcast(envelope, senderSocketId = null) {
        if (this._isDestroyed) return

        // Додаємо метадані відправника для захисту від Echo
        const finalEnvelope = {
            ...envelope,
            senderId: senderSocketId,
        }

        try {
            // Публікація повідомлення через брокер (горизонтальне масштабування)
            await this.ns.broker.publish(this.topic, {
                ...finalEnvelope,
                serverId: this.ns.serverId, //originId
            })

            // Локальна доставка на цій ноді
            this.dispatch(finalEnvelope)
        } catch (error) {
            this.logger?.error('Global broadcast failed', {
                error: error.message,
                event: envelope.event,
            })
        }
    }

    /**
     * Відправляє повідомлення ТІЛЬКИ локальним підписникам на цій ноді.
     * Викликається зазвичай адаптером брокера при отриманні повідомлення з мережі.
     * @param {MessageEnvelopeDTO} envelope
     * @example
     * room.dispatch(envelope);
     */
    dispatch(envelope) {
        if (this._isDestroyed) return
        if (this._localSockets.size === 0) return

        const { senderId, serverId = null } = envelope

        // INSTANCE ECHO PROTECTION:
        // Якщо serverId збігається з нашим instanceId, це означає, що ЦЯ нода
        // сама відправила це повідомлення в брокер. Ми його ігноруємо,
        // бо брокер прислав нам нашу ж копію.
        if (serverId && serverId === this.ns.serverId) {
            return
        }

        // Використовуємо ітератор, щоб не блокувати цикл подій надовго
        // Для екстремальних навантажень тут можна додати setImmediate через кожні N пакетів
        for (const socket of this._localSockets) {
            // SOCKET ECHO PROTECTION:
            // Не відправляємо повідомлення клієнту, який його створив.
            if (senderId && socket.id === senderId) {
                continue
            }

            socket.rawSend(envelope)
        }
    }

    /**
     * @private
     */
    async _subscribeToBroker() {
        // Уже підписані - нічого не робимо
        if (this._isSubscribed) return

        try {
            // Брокер викликає dispatch для кожного вхідного повідомлення з мережі
            await this.ns.broker.subscribe(this.topic, (envelope) => {
                this.dispatch(envelope)
            })
            this._isSubscribed = true
            this.logger?.info('Room Room broker subscription activated', { topic: this.topic })
        } catch (error) {
            this.logger?.error('Room broker subscription activation failed', {
                error: error.message,
            })
            throw error // Critical error, blocking 'add'
        }
    }

    /**
     * @private
     */
    async _unsubscribeFromBroker() {
        if (!this._isSubscribed) return

        try {
            await this.ns.broker.unsubscribe(this.topic)
            this._isSubscribed = false
            this.logger?.info('Room broker subscription deactivated', { topic: this.topic })
        } catch (error) {
            this.logger?.error('Room broker unsubscribe failed', { error: error.message })
        }
    }

    /**
     * Очищення ресурсів кімнати.
     */
    async destroy() {
        if (this._isDestroyed) return
        this._isDestroyed = true

        await this._unsubscribeFromBroker()
        this._localSockets.clear()

        this.logger?.info('Room destroyed', {
            uptime: this.uptime,
            countActiveLocalSockets: this._localSockets.size,
        })
    }
}
