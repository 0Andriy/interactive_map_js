/**
 * WSAdapter - Просунута обгортка над WebSocket (Версія 2026).
 *
 * Особливості:
 * - Exponential Backoff Reconnect: Розумне перепідключення з джитером.
 * - Rate Limiting: Контрольована черга повідомлень для обходу банів.
 * - Request-Response Pattern: Підтримка асинхронних запитів з очікуванням відповіді.
 * - Heartbeat (Zombie Detection): Примусовий розрив при зависанні каналу.
 * - Online/Offline Awareness: Автоматичне призупинення спроб при відсутності інтернету.
 *
 * @example
 * const ws = new WSAdapter('wss://api.example.com', {
 *   authProvider: async () => await fetchToken(),
 *   rateLimitDelay: 100
 * });
 *
 * ws.on('data', (data) => console.log('Отримано:', data));
 * ws.on('statusChange', (status) => console.log('Статус:', status));
 *
 * await ws.connect();
 *
 * // Використання патерну Запит-Відповідь
 * try {
 *   const response = await ws.request({ type: 'GET_USER', id: 1 });
 *   console.log('Дані користувача:', response);
 * } catch (e) {
 *   console.error('Таймаут або помилка запиту');
 * }
 */
export default class WSAdapter {
    #ws = null
    #reconnectTimer = null
    #pingTimer = null
    #pongTimeoutTimer = null
    #events = new Map()
    #pendingRequests = new Map()
    #instanceId

    /**
     * @param {string} url - URL WebSocket сервера.
     * @param {Object} options - Конфігурація адаптера.
     * @param {boolean} [options.reconnect=true] - Чи дозволено авто-реконнект.
     * @param {number} [options.maxRetries=15] - Максимальна кількість спроб.
     * @param {number} [options.baseDelay=1000] - Базова затримка реконнекту (мс).
     * @param {number} [options.maxDelay=30000] - Максимальна затримка реконнекту (мс).
     * @param {Function} [options.authProvider=null] - Асинхронна функція для отримання токена.
     * @param {number} [options.pingInterval=30000] - Як часто слати пінг (мс).
     * @param {number} [options.pongTimeout=5000] - Час очікування відповіді на пінг (мс).
     * @param {number} [options.rateLimitDelay=50] - Пауза між повідомленнями в черзі (мс).
     * @param {boolean} [options.autoJson=true] - Чи парсити JSON автоматично.
     * @param {number} [options.maxQueueSize=100] - Розмір черги при офлайні.
     * @param {string} [options.binaryType='blob'] - Тип бінарних даних ('blob'|'arraybuffer').
     * @param {Object} [logger=console] - Об'єкт логера.
     */
    constructor(url, options = {}, logger = console) {
        this.url = url
        this.logger = logger?.child?.({ component: 'WSAdapter' }) ?? logger
        this.#instanceId = Math.random().toString(36).substring(2, 9).toUpperCase()

        this.options = {
            reconnect: true,
            maxRetries: 15,
            baseDelay: 1000,
            maxDelay: 30000,
            authProvider: null,
            pingInterval: 30000,
            pongTimeout: 5000,
            rateLimitDelay: 50,
            autoJson: true,
            maxQueueSize: 100,
            binaryType: 'blob',
            ...options,
        }

        this.retries = 0
        this.messageQueue = []
        this.isManualClose = false
        this.currentStatus = 'CLOSED'

        this.#initGlobalListeners()
        this.logger?.info?.(`[WS-${this.#instanceId}] Initialized for ${url}`)
    }

    /** @returns {string} Поточний статус з'єднання (CONNECTING, OPEN, CLOSING, CLOSED) */
    get status() {
        return this.currentStatus
    }

    /** @returns {boolean} Чи відкрите з'єднання в даний момент */
    get isConnected() {
        return this.#ws?.readyState === (typeof WebSocket !== 'undefined' ? WebSocket.OPEN : 1)
    }

    /**
     * Ініціалізація з'єднання.
     * @returns {Promise<void>}
     */
    async connect() {
        if (this.isConnected) return

        this.#clearTimers()
        this.isManualClose = false
        this.#updateStatus('CONNECTING')

        this.logger?.info?.(`[WS-${this.#instanceId}] Connecting...`)
        let finalUrl = this.url

        try {
            if (this.options.authProvider) {
                this.logger?.info?.(`[WS-${this.#instanceId}] Fetching auth token...`)
                const token = await this.options.authProvider()
                if (token) {
                    const separator = finalUrl.includes('?') ? '&' : '?'
                    finalUrl = `${finalUrl}${separator}token=${encodeURIComponent(token)}`
                }
            }

            this.#ws = new WebSocket(finalUrl)
            this.#ws.binaryType = this.options.binaryType
            this.#registerNativeListeners()
        } catch (error) {
            this.logger?.error?.(`[WS-${this.#instanceId}] Connection setup failed:`, error)
            this.#updateStatus('CLOSED')
            this.#handleReconnect()
        }
    }

    /**
     * Відправляє дані. Якщо сокет закритий — додає в чергу.
     * @param {any} data - Дані
     * @param {number} [ttl=0] - Час життя повідомлення в черзі (мс)
     */
    send(data, ttl = 0) {
        const payload =
            this.options.autoJson && typeof data === 'object' && data !== null
                ? JSON.stringify(data)
                : data

        if (this.isConnected) {
            this.#ws.send(payload)

            this.logger?.debug?.(
                `[WS-${this.#instanceId}] Outgoing message sent (Size: ${payload.length} chars)`,
            )
        } else {
            if (this.messageQueue.length >= this.options.maxQueueSize) {
                const dropped = this.messageQueue.shift()

                this.logger?.warn?.(
                    `[WS-${this.#instanceId}] Queue overflow. Dropped oldest message.`,
                )
            }

            this.messageQueue.push({
                payload,
                expiry: ttl > 0 ? Date.now() + ttl : null,
            })
            this.logger?.warn?.(
                `[WS-${this.#instanceId}] Socket not open. Queued. Current queue size: ${
                    this.messageQueue.length
                }`,
            )
        }
    }

    /**
     * Відправляє запит і чекає на відповідь від сервера (Request-Response pattern).
     * Сервер має повернути об'єкт з тим самим requestId.
     * @param {Object} data - Об'єкт даних.
     * @param {number} [timeout=10000] - Таймер очікування.
     * @returns {Promise<Object>}
     */
    async request(data, timeout = 10000) {
        const requestId = Math.random().toString(36).substring(2, 9)
        const payload = { ...data, requestId }

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.#pendingRequests.delete(requestId)
                reject(new Error(`[WS-${this.#instanceId}] Request timeout: ${requestId}`))
            }, timeout)

            this.#pendingRequests.set(requestId, (response) => {
                clearTimeout(timer)
                resolve(response)
            })

            this.send(payload)
        })
    }

    /**
     * М'яке перепідключення (наприклад, для оновлення токена)
     */
    refresh() {
        this.logger?.info?.(`[WS-${this.#instanceId}] Soft restart...`)
        if (this.#ws) {
            this.#ws.close(4000, 'Refresh')
        }
    }

    /**
     * Повністю закриває з'єднання та очищує ресурси.
     */
    disconnect() {
        this.logger?.info?.(`[WS-${this.#instanceId}] Manual disconnect triggered`)
        this.isManualClose = true
        this.#clearTimers()
        if (this.#ws) {
            this.#ws.close(1000, 'Client closing connection')
            this.#ws = null
        }
        this.#updateStatus('CLOSED')
        this.messageQueue = []
        this.#pendingRequests.forEach((resolve) => resolve({ error: 'Connection closed manually' }))
        this.#pendingRequests.clear()
    }

    /**
     * Підписка на події.
     * @param {string} event - Назва події (connected, disconnected, data, binary, error, statusChange)
     * @param {Function} callback
     * @returns {Function} Функція для відписки.
     *
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
     * Змінюємо статус підключення
     */
    #updateStatus(newStatus) {
        if (this.currentStatus !== newStatus) {
            this.currentStatus = newStatus
            this.#emit('statusChange', newStatus)
        }
    }

    /**
     *
     */
    #initGlobalListeners() {
        if (typeof window !== 'undefined') {
            window.addEventListener('online', () => {
                if (!this.isConnected && !this.isManualClose) {
                    this.logger?.info?.(`[WS-${this.#instanceId}] Network online. Reconnecting...`)
                    this.connect()
                }
            })
        }
    }

    /**
     * Прив'язка нативних обробників WebSocket до внутрішньої системи подій.
     * @private
     */
    #registerNativeListeners() {
        if (!this.#ws) return

        this.#ws.onopen = (event) => {
            this.logger?.info?.(`[WS-${this.#instanceId}] ✅ Connection established`)
            this.#updateStatus('OPEN')
            this.retries = 0
            this.#emit('connected', { url: this.url, timestamp: new Date() })
            // this.#startHeartbeat()
            this.#flushQueue()

            this.#emit('open', event)
        }

        this.#ws.onmessage = (event) => {
            this.#resetPongTimeout()

            let data = event.data

            this.logger?.trace?.(`[WS-${this.#instanceId}] Raw message received`, data)

            // Обробка бінарних даних
            if (
                data instanceof ArrayBuffer ||
                (typeof Blob !== 'undefined' && data instanceof Blob)
            ) {
                this.#emit('binary', data)
                return
            }

            if (this.options.autoJson && typeof data === 'string') {
                try {
                    data = JSON.parse(data)

                    // Обробка системного PONG (якщо сервер шле JSON)
                    if (data.type === 'pong' || data.action === 'pong') {
                        this.#resetPongTimeout()
                        this.logger?.debug?.(`[WS-${this.#instanceId}] Pong received (JSON)`)
                        return
                    }

                    // Перевірка патерну Request-Response
                    if (data?.requestId && this.#pendingRequests.has(data.requestId)) {
                        const resolver = this.#pendingRequests.get(data.requestId)
                        this.#pendingRequests.delete(data.requestId)
                        resolver(data)
                        return
                    }
                } catch (e) {
                    this.logger?.trace?.(
                        `[WS-${this.#instanceId}] JSON parse failed, using raw string`,
                        error,
                    )
                }
            }

            this.#emit('data', data)
            this.#emit('message', data)

            // Trigger typed message handlers
            if (data.event) {
                this.#emit(data.event, data)
            }
        }

        if (typeof this.#ws.on === 'function') {
            this.#ws.on('pong', () => {
                this.#resetPongTimeout()
                this.logger?.debug?.(`[WS-${this.#instanceId}] Protocol Pong received`)
            })
        }

        this.#ws.onerror = (error) => {
            this.logger?.error?.(`[WS-${this.#instanceId}] ❗ WebSocket Error:`, error)
            this.#emit('error', error)
        }

        this.#ws.onclose = (event) => {
            this.#updateStatus('CLOSED')
            this.#stopHeartbeat()

            if (!this.isManualClose) {
                this.logger?.warn?.(
                    `[WS-${this.#instanceId}] ⚠️ Disconnected. Code: ${event.code}, Reason: ${
                        event.reason || 'None'
                    }`,
                )
                this.#emit('disconnected', { code: event.code })
                this.#emit('close', event)
                this.#handleReconnect()
            }
        }
    }

    /**
     * Виштовхує накопичені повідомлення з черги після відновлення з'єднання.
     * @private
     */
    async #flushQueue() {
        if (this.messageQueue.length === 0) return
        this.logger?.info?.(
            `[WS-${this.#instanceId}] 📤 Flushing queue: ${this.messageQueue.length} items`,
        )

        while (this.messageQueue.length > 0 && this.isConnected) {
            const item = this.messageQueue.shift()

            // Перевірка TTL повідомлення
            if (item.expiry && Date.now() > item.expiry) {
                this.logger?.debug?.(
                    `[WS-${this.#instanceId}] Skipped an outdated message from the queue`,
                )
                continue
            }

            this.#ws.send(item.payload)

            if (this.options.rateLimitDelay > 0) {
                await new Promise((r) => setTimeout(r, this.options.rateLimitDelay))
            }
        }
    }

    /**
     *
     */
    #handleReconnect() {
        if (!this.options.reconnect) return
        if (this.isManualClose) return
        if (this.#reconnectTimer) return

        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            this.logger?.warn?.(`[WS-${this.#instanceId}] Device offline. Waiting for network...`)
            return
        }

        if (this.retries >= this.options.maxRetries) {
            this.logger?.error?.(
                `[WS-${this.#instanceId}] ❌ Max retries reached (${this.retries} attempts).`,
            )
            return
        }

        const delay = Math.min(
            this.options.maxDelay,
            this.options.baseDelay * Math.pow(2, this.retries),
        )
        const jitter = delay * 0.2 * (Math.random() * 2 - 1)
        const finalDelay = Math.max(0, delay + jitter)

        this.#reconnectTimer = setTimeout(() => {
            this.#reconnectTimer = null
            this.retries++
            this.connect()
        }, finalDelay)

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

        this.logger?.info?.(
            `[WS-${this.#instanceId}] 🔄 Reconnect attempt #${
                this.retries + 1
            } scheduled at [${timeString}] ` + `(in ${(finalDelay / 1000).toFixed(2)}s)`,
        )
    }

    /**
     * Запускає інтервал відправки 'ping'.
     * @private
     */
    #startHeartbeat() {
        if (this.options.pingInterval <= 0) return

        this.logger?.info?.(
            `[WS-${this.#instanceId}] Heartbeat started (${this.options.pingInterval}ms)`,
        )

        this.#pingTimer = setInterval(() => {
            if (this.isConnected) {
                // Відправляємо пінг
                this.#ws.send(
                    JSON.stringify({
                        type: 'ping',
                        event: 'ping',
                        timestamp: Date.now(),
                    }),
                )

                // Якщо використовується бібліотека 'ws' в Node.js, можна слати протокольний пінг:
                if (typeof this.#ws.ping === 'function') {
                    this.#ws.ping()
                }

                // Очікуємо понг (якщо не прийде - розриваємо для реконнекту)
                this.#pongTimeoutTimer = setTimeout(() => {
                    this.logger?.error?.(
                        `[WS-${this.#instanceId}] 🚨 Pong timeout. Killing connection.`,
                    )
                    this.#ws?.close()
                }, this.options.pongTimeout)
            }
        }, this.options.pingInterval)
    }

    /**
     *
     */
    #resetPongTimeout() {
        if (this.#pongTimeoutTimer) {
            clearTimeout(this.#pongTimeoutTimer)
            this.#pongTimeoutTimer = null
        }
    }

    /**
     *
     */
    #stopHeartbeat() {
        clearInterval(this.#pingTimer)
        this.#resetPongTimeout()
    }

    /**
     *
     */
    #clearTimers() {
        if (this.#reconnectTimer) {
            clearTimeout(this.#reconnectTimer)
            this.#reconnectTimer = null
        }
        this.#stopHeartbeat()
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
            this.logger?.trace?.(`[WS-${this.#instanceId}] Emitting event: ${event}`, data)
            listeners.forEach((cb) => {
                try {
                    cb(data)
                } catch (error) {
                    this.logger?.error?.(
                        `[WS-${this.#instanceId}] Error in listener "${event}":`,
                        error,
                    )
                }
            })
        }
    }
}
