import crypto from 'crypto'

/**
 * Клас Connection: індивідуальна абстракція над сокетом.
 * Відповідає за життєвий цикл з'єднання, безпеку (Rate Limiting) та обробку подій.
 */
export class Connection {
    /**
     * Створює екземпляр з'єднання.
     * @param {import('ws').WebSocket} ws - Екземпляр WebSocket сокета.
     * @param {import('./Namespace').Namespace} ns - Неймспейс, до якого належить з'єднання.
     * @param {Object|null} user - Об'єкт користувача після авторизації.
     * @param {import('../interfaces/ILogger').ILogger} logger - Інтерфейс для логування.
     * @param {string} ip - IP-адреса клієнта.
     */
    constructor(ws, ns, user, logger, ip) {
        /** @type {string} */
        this.id = crypto.randomUUID()

        /** @type {import('ws').WebSocket} */
        this.ws = ws

        /** @type {import('./Namespace').Namespace} */
        this.ns = ns

        /** @type {Object|null} */
        this.user = user

        /** @type {import('../interfaces/ILogger').ILogger} */
        this.logger = logger

        /**
         * Метадані підключення для моніторингу та безпеки.
         * @type {Object}
         */
        this.meta = {
            connectedAt: new Date(),
            isAlive: true,
            msgCount: 0,
            lastReset: Date.now(),
            lastSeen: new Date(),
            ip,
        }

        this._setupListeners()
    }

    /**
     * Налаштування обробників подій сокета.
     * @private
     */
    _setupListeners() {
        this.ws.on('message', (data) => this._handleIncomingMessage(data))

        this.ws.on('pong', () => {
            this.meta.isAlive = true
            this.meta.lastSeen = new Date()
        })

        this.ws.on('close', () => this.destroy())

        this.ws.on('error', (err) => {
            this.logger?.error(`[Conn:${this.id}] Помилка сокета: ${err.message}`, {
                userId: this.user?.id,
            })
        })
    }

    /**
     * Обробка вхідних даних із застосуванням Rate Limiting.
     * @param {Buffer|ArrayBuffer|Buffer[]} data - Сирі дані з сокета.
     * @private
     */
    _handleIncomingMessage(data) {
        const now = Date.now()

        // Rate Limit: Скидання лічильника кожну секунду
        if (now - this.meta.lastReset > 1000) {
            this.meta.msgCount = 0
            this.meta.lastReset = now
        }

        this.meta.msgCount++

        // Порогове значення для захисту від DOS-атак (напр. 50 повідомлень на сек)
        if (this.meta.msgCount > 50) {
            this.logger?.warn(
                `[Conn:${this.id}] Rate limit exceeded (IP: ${this.meta.ip}). Термінація.`,
            )
            return this.ws.terminate()
        }

        // Передача на обробку в неймспейс
        this.ns.onMessage(this, data)
    }

    /**
     * Безпечне надсилання даних клієнту.
     * Автоматично серіалізує об'єкти в JSON, але ігнорує вже готові рядки та буфери.
     * @param {Object|string|Buffer} payload - Дані для відправки (об'єкт, JSON-рядок або Buffer).
     */
    send(payload) {
        if (this.ws.readyState !== this.ws.OPEN) return

        try {
            let data

            // Перевіряємо тип вхідних даних
            if (payload instanceof Buffer || typeof payload === 'string') {
                // Якщо це вже Buffer або рядок (результат Batching або JSON.stringify),
                // надсилаємо як є без повторної серіалізації.
                data = payload
            } else if (typeof payload === 'object') {
                // Якщо це «сирий» об'єкт, перетворюємо його на JSON.
                data = JSON.stringify(payload)
            } else {
                data = String(payload)
            }

            this.ws.send(data, (err) => {
                if (err) {
                    this.logger?.error(`[Conn:${this.id}] Помилка запису в сокет: ${err.message}`)
                }
            })
        } catch (error) {
            this.logger?.error(`[Conn:${this.id}] Помилка серіалізації: ${error.message}`)
        }
    }

    /**
     * Повне очищення ресурсів з'єднання та вихід з усіх кімнат.
     * @returns {Promise<void>}
     */
    async destroy() {
        this.logger?.info(`[Conn:${this.id}] Початок відключення від ${this.ns.name}`)

        try {
            // Отримуємо список усіх кімнат користувача через розподілений стан
            const rooms = await this.ns.state.getUserRooms(this.ns.name, this.id)

            // Паралельний вихід з усіх кімнат (allSettled ігнорує поодинокі помилки, дозволяючи іншим завершитись)
            const leaveResults = await Promise.allSettled(
                rooms.map(async (roomName) => {
                    const roomObj = this.ns.roomsMap.get(roomName)
                    if (roomObj) {
                        await roomObj.leave(this.id)
                    }
                }),
            )

            // Видаляємо себе з реєстру активних з'єднань неймспейсу
            this.ns.connections.delete(this.id)

            // Якщо сокет ще відкритий — закриваємо його
            if (this.ws.readyState === this.ws.OPEN) {
                this.ws.close()
            }

            this.logger?.info(`[Conn:${this.id}] З'єднання успішно закрито.`)
        } catch (error) {
            this.logger?.error(`[Conn:${this.id}] Помилка при знищенні з'єднання: ${error.message}`)
        }
    }
}
