/**
 * Конфігурація для WebSocket адаптера.
 * @typedef {Object} WSOptions
 * @property {boolean} [reconnect=true] - Чи намагатися відновити з'єднання автоматично.
 * @property {number} [maxRetries=15] - Максимальна кількість спроб реконнекту.
 * @property {number} [baseDelay=1000] - Початкова затримка перед реконнектом (мс).
 * @property {number} [maxDelay=30000] - Максимальна затримка між спробами (мс).
 * @property {() => Promise<string|null>} [authProvider=null] - Асинхронна функція для отримання токена.
 * @property {number} [pingInterval=30000] - Інтервал пінгів (мс). 0 - вимкнено.
 * @property {boolean} [autoJson=true] - Чи автоматично перетворювати JSON.
 * @property {number} [maxQueueSize=100] - Максимальна кількість повідомлень у черзі.
 */

/**
 * Стани WebSocket з'єднання відповідно до специфікації.
 * @typedef {('CONNECTING'|'OPEN'|'CLOSING'|'CLOSED')} WSState
 */

/**
 * Професійна обгортка над WebSocket.
 * Забезпечує стабільне з'єднання, чергу повідомлень та автоматичне відновлення.
 */
export default class WSAdapter {
    /** @type {WebSocket|null} */
    #ws = null

    /** @type {ReturnType<setTimeout>|null} */
    #reconnectTimer = null

    /** @type {ReturnType<setInterval>|null} */
    #pingTimer = null

    /**
     * Реєстр подій: ключ - назва події, значення - набір унікальних колбеків.
     * @type {Map<string, Set<Function>>}
     */
    #events = new Map()

    /** @type {string} */
    #instanceId

    /**
     * Створює екземпляр WSAdapter.
     * @param {string} url - WebSocket URL.
     * @param {WSOptions} [options={}] - Конфігурація.
     * @param {Console|Object} [logger=console] - Логер.
     */

    constructor(url, options = {}, logger = console) {
        /** @readonly */
        this.url = url

        /** @readonly */
        this.logger = logger

        /** @private */
        this.#instanceId = Math.random().toString(36).substring(2, 9).toUpperCase()

        this.options = {
            reconnect: true,
            maxRetries: 15,
            baseDelay: 1000,
            maxDelay: 30000,
            authProvider: null,
            pingInterval: 30000,
            autoJson: true,
            maxQueueSize: 100,
            ...options,
        }

        this.retries = 0
        this.messageQueue = []
        this.isManualClose = false

        this.logger?.info(`[WS-${this.#instanceId}] Initialized for ${url}`)
    }

    /**
     * Реєструє обробник події.
     * @param {'data'|'connected'|'disconnected'|'error'|string} event - Назва події.
     * @param {(data?: any) => void} callback - Функція, що буде викликана.
     * @returns {() => void} Функція для швидкої відписки.
     * @example
     * const unmatch = ws.on('data', console.log);
     * // пізніше
     * unmatch();
     */
    on(event, callback) {
        let handlers = this.#events.get(event)

        if (!handlers) {
            handlers = new Set()
            this.#events.set(event, handlers)
        }

        handlers.add(callback)
        return () => this.off(event, callback)
    }

    /**
     * Видаляє обробник події.
     * @param {string} event - Назва події.
     * @param {Function} callback - Посилання на функцію обробник.
     */
    off(event, callback) {
        const handlers = this.#events.get(event)
        if (handlers) {
            handlers.delete(callback)
        }
    }

    /**
     * Внутрішній метод для виклику підписаних обробників.
     * @param {string} event - Назва події.
     * @param {any} [data] - Дані для передачі в обробник.
     * @private
     */
    #emit(event, data) {
        const listeners = this.#events.get(event)
        if (listeners) {
            this.logger?.trace(`[WS-${this.#instanceId}] Emitting event: ${event}`, data)
            listeners.forEach((cb) => {
                try {
                    cb(data)
                } catch (error) {
                    this.logger?.error(
                        `[WS-${this.#instanceId}] Error in listener "${event}":`,
                        error,
                    )
                }
            })
        }
    }

    /**
     * Ініціює підключення до сервера.
     * @async
     * @returns {Promise<void>}
     */
    async connect() {
        this.#clearTimers()
        this.isManualClose = false

        this.logger?.info(`[WS-${this.#instanceId}] Connecting...`)
        let finalUrl = this.url

        try {
            if (this.options.authProvider) {
                this.logger?.info(`[WS-${this.#instanceId}] Fetching auth token...`)
                const token = await this.options.authProvider()
                if (token) {
                    const separator = finalUrl.includes('?') ? '&' : '?'
                    finalUrl = `${finalUrl}${separator}token=${encodeURIComponent(token)}`
                }
            }

            this.#ws = new WebSocket(finalUrl)
            this.#registerNativeListeners()
        } catch (error) {
            this.logger?.error(`[WS-${this.#instanceId}] Connection setup failed:`, error)
            this.#handleReconnect()
        }
    }

    /**
     * Прив'язка нативних обробників WebSocket до внутрішньої системи подій.
     * @private
     */
    #registerNativeListeners() {
        if (!this.#ws) return

        this.#ws.onopen = () => {
            this.logger?.info(`[WS-${this.#instanceId}] ✅ Established successfully`)
            this.retries = 0
            this.#emit('connected', { url: this.url, timestamp: new Date().toISOString() })
            this.#startHeartbeat()
            this.#flushQueue()
        }

        this.#ws.onmessage = (event) => {
            let data = event.data
            this.logger?.trace(`[WS-${this.#instanceId}] Raw message received`, data)

            if (this.options.autoJson && typeof data === 'string') {
                try {
                    data = JSON.parse(data)
                } catch (error) {
                    this.logger?.warn(
                        `[WS-${this.#instanceId}] JSON parse failed, using raw string`,
                        error,
                    )
                }
            }
            this.#emit('data', data)
        }

        this.#ws.onclose = (event) => {
            this.#stopHeartbeat()
            if (!this.isManualClose) {
                this.logger?.warn(
                    `[WS-${this.#instanceId}] ⚠️ Lost connection. Code: ${event.code}, Reason: ${
                        event.reason || 'None'
                    }`,
                )
                this.#emit('disconnected', { code: event.code, reason: event.reason })
                this.#handleReconnect()
            }
        }

        this.#ws.onerror = (error) => {
            this.logger?.error(`[WS-${this.#instanceId}] ❗ WebSocket Error:`, error)
            this.#emit('error', error)
        }
    }

    /**
     * Відправляє дані. Якщо з'єднання відсутнє, додає в чергу.
     * @param {Object|Array|string|number} data - Дані для відправки.
     */
    send(data) {
        let payload

        // Розумна серіалізація:
        // Якщо autoJson = true і ми отримали об'єкт (не рядок) — серіалізуємо.
        // Якщо це вже рядок — відправляємо як є.
        if (this.options.autoJson && typeof data === 'object' && data !== null) {
            payload = JSON.stringify(data)
        } else {
            payload = data
        }

        if (this.#ws.readyState === this.#ws.OPEN) {
            this.#ws.send(payload)
            this.logger?.info(
                `[WS-${this.#instanceId}] Outgoing message sent (Size: ${payload.length} chars)`,
            )
        } else {
            if (this.messageQueue.length >= this.options.maxQueueSize) {
                const dropped = this.messageQueue.shift()
                this.logger?.warn(
                    `[WS-${this.#instanceId}] Queue overflow. Dropped oldest message.`,
                )
            }
            this.messageQueue.push(payload)
            this.logger?.warn(
                `[WS-${this.#instanceId}] Socket not open. Queued. Current queue size: ${
                    this.messageQueue.length
                }`,
            )
        }
    }

    /**
     * Обчислює затримку та створює таймер для повторного підключення.
     * @private
     */
    #handleReconnect() {
        if (!this.options.reconnect) return

        if (this.retries >= this.options.maxRetries) {
            this.logger?.error(
                `[WS-${this.#instanceId}] ❌ Reconnection failed after ${this.retries} attempts.`,
            )
            return
        }

        const delay = Math.min(
            this.options.maxDelay,
            this.options.baseDelay * Math.pow(2, this.retries),
        )
        const jitter = delay * 0.2 * (Math.random() * 2 - 1)
        const finalDelay = Math.max(0, delay + jitter)

        // Розрахунок точного часу наступної спроби
        const nextAttemptDate = new Date(Date.now() + finalDelay)
        const timeString = nextAttemptDate
            .toLocaleString('en-GB', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
                fractionalSecondDigits: 2,
            })
            .replace(',', '')

        this.logger?.info(
            `[WS-${this.#instanceId}] 🔄 Reconnect attempt #${
                this.retries + 1
            } scheduled at [${timeString}] ` + `(in ${(finalDelay / 1000).toFixed(2)}s)`,
        )

        this.#reconnectTimer = setTimeout(() => {
            this.retries++
            this.connect()
        }, finalDelay)
    }

    /**
     * Запускає інтервал відправки 'ping'.
     * @private
     */
    #startHeartbeat() {
        if (this.options.pingInterval <= 0) return
        this.logger?.info(
            `[WS-${this.#instanceId}] Heartbeat started (${this.options.pingInterval}ms)`,
        )
        this.#pingTimer = setInterval(() => {
            if (this.#ws.readyState === this.#ws.OPEN) {
                this.#ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }))
            }
        }, this.options.pingInterval)
    }

    /** @private */
    #stopHeartbeat() {
        if (this.#pingTimer) {
            clearInterval(this.#pingTimer)
            this.logger?.info(`[WS-${this.#instanceId}] Heartbeat stopped`)
        }
    }

    /** @private */
    #clearTimers() {
        if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer)
        this.#stopHeartbeat()
    }

    /**
     * Виштовхує накопичені повідомлення з черги після відновлення з'єднання.
     * @private
     */
    #flushQueue() {
        if (this.messageQueue.length === 0) return
        this.logger?.info(
            `[WS-${this.#instanceId}] 📤 Flushing ${this.messageQueue.length} messages from queue`,
        )

        while (this.messageQueue.length > 0 && this.#ws.readyState === this.#ws.OPEN) {
            const msg = this.messageQueue.shift()
            this.#ws.send(msg)
        }
    }

    /**
     * Повністю закриває з'єднання та зупиняє всі процеси реконекту.
     */
    disconnect() {
        this.logger?.info(`[WS-${this.#instanceId}] Closing connection manually...`)
        this.isManualClose = true
        this.#clearTimers()
        if (this.#ws) {
            this.#ws.close(1000, 'Normal Closure')
            this.#ws = null
        }
    }

    /**
     * Повертає текстовий статус з'єднання.
     * @returns {WSState}
     */
    get status() {
        if (!this.#ws) return 'CLOSED'
        const states = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']
        return states[this.#ws.readyState]
    }
}
