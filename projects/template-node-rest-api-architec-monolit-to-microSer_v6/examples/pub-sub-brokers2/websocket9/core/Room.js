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
        this.namespace = namespace

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
        this.sockets = new Set()

        /**
         * Топік для брокера подій (горизонтальне масштабування).
         * @type {string}
         */
        this.topic = `broker:ns:${this.namespace.name}:room:${this.name}`

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

        this.logger?.info?.(`[${this.constructor.name}] Room instance created`, {
            topic: this.topic,
            createdAt: this.createdAt,
        })
    }

    /**
     * Повертає кількість локальних сокетів у кімнаті на цій ноді.
     * @returns {number}
     * @example
     * const size = room.size;
     */
    get size() {
        return this.sockets.size
    }

    /**
     * Повертає true, якщо в кімнаті немає локальних сокетів.
     * @returns {boolean}
     * @example
     * const empty = room.isEmpty;
     */
    get isEmpty() {
        return this.sockets.size === 0
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
            return await this.namespace.state.getCountInRoom(this.namespace.name, this.name)
        } catch (error) {
            this.logger?.error?.(`[${this.constructor.name}] Failed to get global member count`, {
                error: error.message,
            })
            return this.sockets.size // Fallback до локальних даних
        }
    }

    /**
     * Повертає список ідентифікаторів усіх учасників кімнати (всіх нод).
     * @returns {Promise<string[]>}
     * @example
     * const members = await room.getMembers();
     */
    async getMembers() {
        try {
            return await this.namespace.state.getMembersInRoom(this.namespace.name, this.name)
        } catch (error) {
            this.logger?.error?.(`[${this.constructor.name}] Failed to get global members`, {
                error: error.message,
            })
            return Array.from(this.sockets).map((s) => s.id)
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
        if (this.sockets.has(socket)) return

        try {
            // АКТИВАЦІЯ ПІДПИСКИ: Тільки якщо це перший локальний користувач
            if (this.sockets.size === 0 && !this._isSubscribed) {
                await this._subscribeToBroker()
            }

            // Додавання локального сокета
            this.sockets.add(socket)

            // Оновлення глобального стану (Redis/Shared State)
            await this.namespace.state.addUserToRoom(this.namespace.name, this.name, socket.id)

            this.logger?.debug?.(`[${this.constructor.name}] Socket added to room`, {
                socketId: socket.id,
                count: this.sockets.size,
            })
        } catch (error) {
            this.logger?.error?.(`[${this.constructor.name}] Failed to add socket to room`, {
                socketId: socket.id,
                error: error.message,
            })

            // Якщо підписка не вдалася, ми не додаємо юзера і чистимо підписку, якщо вона була ініційована
            if (this.sockets.size === 0) {
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
        if (!this.sockets.has(socket)) return

        // 1. Видаляємо сокет з локального Set
        this.sockets.delete(socket)

        // 2. Оновлюємо стан у Redis/DB (глобальний стан)
        try {
            await this.namespace.state.removeUserFromRoom(this.namespace.name, this.name, socket.id)
        } catch (error) {
            this.logger?.error?.(`[${this.constructor.name}] State removal failed`, {
                error: error.message,
            })
        }

        this.logger?.debug?.(`[${this.constructor.name}] Socket removed from room`, {
            socketId: socket.id,
            count: this.sockets.size,
        })

        // 3. ПІДПИСКА: Відписуємось від брокера, тільки якщо сокетів 0
        if (this.isEmpty) {
            this.logger?.info?.(
                `[${this.constructor.name}] No local users remaining. Deactivating room broker subscription.`,
            )
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
        const packet = {
            ...envelope,
            senderId: senderSocketId,
            originServerId: this.namespace.serverId,
            timestamp: Date.now(),
        }

        try {
            // Публікуємо для інших нод
            await this.namespace.broker.publish(this.topic, packet)

            // Доставляємо своїм локальним сокетам
            this.dispatch(packet)
        } catch (error) {
            this.logger?.error?.(`[${this.constructor.name}] Broadcast failed`, {
                error: error.message,
                event: envelope.event,
            })
        }
    }

    /**
     * Відправляє повідомлення ТІЛЬКИ локальним підписникам на цій ноді.
     * Викликається зазвичай адаптером брокера при отриманні повідомлення з мережі.
     * @param {MessageEnvelopeDTO} packet
     * @example
     * room.dispatch(packet);
     */
    dispatch(packet) {
        if (this._isDestroyed) return
        if (this.sockets.size === 0) return

        const { senderId, originServerId = null } = packet

        // INSTANCE ECHO PROTECTION:
        // Якщо originServerId збігається з нашим instanceId, це означає, що ЦЯ нода
        // сама відправила це повідомлення в брокер. Ми його ігноруємо,
        // бо брокер прислав нам нашу ж копію.
        if (originServerId && originServerId === this.namespace.serverId) {
            return
        }

        // Використовуємо ітератор, щоб не блокувати цикл подій надовго
        // Для екстремальних навантажень тут можна додати setImmediate через кожні N пакетів
        for (const socket of this.sockets) {
            // SOCKET ECHO PROTECTION:
            // Не відправляємо повідомлення клієнту, який його створив.
            if (senderId && socket.id === senderId) {
                continue
            }

            socket.rawSend(packet)
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
            await this.namespace.broker.subscribe(this.topic, (packet) => {
                // Важливо: обробляємо тільки повідомлення від ІНШИХ серверів
                if (packet.originServerId !== this.namespace.serverId) {
                    this.dispatch(packet)
                }
            })
            this._isSubscribed = true
            this.logger?.info?.(`[${this.constructor.name}] Room broker subscription activated`, {
                topic: this.topic,
            })
        } catch (error) {
            this.logger?.error?.(
                `[${this.constructor.name}] Room broker subscription activation failed`,
                {
                    error: error.message,
                },
            )
            throw error // Critical error, blocking 'add'
        }
    }

    /**
     * @private
     */
    async _unsubscribeFromBroker() {
        if (!this._isSubscribed) return

        try {
            await this.namespace.broker.unsubscribe(this.topic)
            this._isSubscribed = false
            this.logger?.info?.(`[${this.constructor.name}] Room broker subscription deactivated`, {
                topic: this.topic,
            })
        } catch (error) {
            this.logger?.error?.(`[${this.constructor.name}] Room broker unsubscribe failed`, {
                error: error.message,
            })
        }
    }

    /**
     * Очищення ресурсів кімнати.
     */
    async destroy() {
        if (this._isDestroyed) return
        this._isDestroyed = true

        // Відписуємося від брокера
        await this._unsubscribeFromBroker()

        // Видаляємо всіх локальних сокетів з кімнати
        for (const socket of this.sockets) {
            socket.leave(this.name)
        }
        this.sockets.clear()

        //
        this.logger?.info?.(`[${this.constructor.name}] Room destroyed`, {
            uptime: this.uptime,
            count: this.sockets.size,
        })
    }
}
