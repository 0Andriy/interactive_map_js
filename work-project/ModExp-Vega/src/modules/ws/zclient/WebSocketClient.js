/**
 * Словник станів з'єднання (Connection Lifecycle States)
 */
const CONNECTION_STATE = {
    IDLE: 'IDLE',
    CONNECTING: 'CONNECTING',
    CONNECTED: 'OPEN',
    DISCONNECTING: 'CLOSING',
    DISCONNECTED: 'CLOSED',
}

/**
 * WebSocketClient - Просунута обгортка над WebSocket.
 *
 * Особливості:
 * - Exponential Backoff Reconnect: Розумне перепідключення з джитером.
 * - Rate Limiting: Контрольована черга повідомлень для обходу банів.
 * - Request-Response Pattern: Підтримка асинхронних запитів з очікуванням відповіді.
 * - Heartbeat (Zombie Detection): Примусовий розрив при зависанні каналу.
 * - Online/Offline Awareness: Автоматичне призупинення спроб при відсутності інтернету.
 *
 * @example
 * const ws = new WebSocketClient('wss://api.example.com', {
 *   auth: async () => await fetchToken(),
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
export default class WebSocketClient {
    #ws = null
    #reconnectTimer = null
    #heartbeatTimer = null
    #zombieCheckTimer = null
    #eventHandlers = new Map()
    #responseCallbacks = new Map()
    #instanceId

    /**
     * @param {string} url - URL WebSocket сервера.
     * @param {Object} options - Конфігурація адаптера.
     * @param {boolean} [options.reconnection=true] - Чи дозволено авто-перепідключення.
     * @param {number} [options.maxReconnectAttempts=15] - Максимальна кількість спроб реконнекту.
     * @param {number} [options.reconnectionDelay=1000] - Початкова затримка (мс).
     * @param {number} [options.reconnectionDelayMax=30000] - Максимальна затримка (мс).
     * @param {number} [options.backoffFactor=1.5] - Множник експоненціального запізнення.
     * @param {number} [options.jitter=0.5] - Коефіцієнт випадковості затримки (0-1).
     * @param {Function} [options.auth=null] - Асинхронна функція для отримання токена.
     * @param {number} [options.heartbeatInterval=30000] - Інтервал перевірки активності (мс).
     * @param {number} [options.serverTimeout=5000] - Час очікування відповіді (Deadman Switch) (мс).
     * @param {number} [options.messageRateLimit=50] - Затримка між відправкою повідомлень з черги (мс).
     * @param {number} [options.maxQueueSize=100] - Максимальний розмір черги офлайн-повідомлень.
     * @param {string} [options.binaryType='blob'] - Тип бінарних даних ('blob'|'arraybuffer').
     * @param {Object} [logger] - Об'єкт логера.
     */
    constructor(url, options = {}, logger = null) {
        this.url = url
        this.logger = logger?.child?.({ component: 'WebSocketClient' }) ?? logger
        this.#instanceId = Math.random().toString(36).substring(2, 9).toUpperCase()

        this.options = {
            reconnection: true,
            maxReconnectAttempts: 15,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 30000,
            backoffFactor: 2,
            jitter: 0.5,
            auth: null,
            heartbeatInterval: 30000,
            serverTimeout: 5000,
            messageRateLimit: 50,
            maxQueueSize: 100,
            binaryType: 'blob',
            ...options,
        }

        this.reconnectAttempts = 0
        this.messageQueue = []
        this.isManualClose = false
        this.connectionStatus = CONNECTION_STATE.DISCONNECTED

        this.#setupNetworkDetection()
        this.logger?.info?.(`[WS-${this.#instanceId}] Initialized for ${url}`)
    }

    // --- Public API ---

    /** @returns {string} Поточний стан з'єднання */
    get state() {
        return this.connectionStatus
    }

    /** @returns {boolean} Чи відкрите з'єднання в даний момент */
    get isActive() {
        const OPEN = typeof WebSocket !== 'undefined' ? WebSocket.OPEN : 1
        return this.#ws?.readyState === OPEN
    }

    /**
     * Встановлює з'єднання з сервером.
     * @returns {Promise<void>}
     */
    async connect() {
        if (this.isActive) {
            this.logger?.debug?.(`[WS-${this.#instanceId}] Connection already active.`)
            return
        }

        this.#disposeInternalResources()
        this.isManualClose = false
        this.#updateStatus(CONNECTION_STATE.CONNECTING)

        this.logger?.info?.(`[WS-${this.#instanceId}] Connecting...`)

        try {
            let connectionUrl = this.url

            if (this.options.auth) {
                this.logger?.info?.(`[WS-${this.#instanceId}] Fetching auth token...`)

                const token = await this.options.auth()
                if (token) {
                    const separator = connectionUrl.includes('?') ? '&' : '?'
                    connectionUrl = `${connectionUrl}${separator}token=${encodeURIComponent(token)}`
                }
            }

            this.logger?.info?.(`[WS-${this.#instanceId}] Connecting to ${this.url}`)

            this.#ws = new WebSocket(connectionUrl)
            this.#ws.binaryType = this.options.binaryType

            this.#bindSocketEvents()
        } catch (error) {
            this.logger?.error?.(`[WS-${this.#instanceId}] Connection setup failed:`, error)
            this.#updateStatus(CONNECTION_STATE.DISCONNECTED)
            this.#scheduleReconnection()
        }
    }

    /**
     * Відправляє дані або ставить їх у чергу, якщо офлайн.
     * @param {any} data - Об'єкт або рядок.
     * @param {number} [ttl=0] - Час життя повідомлення в черзі (мс).
     */
    send(data, ttl = 0) {
        const payload = typeof data === 'object' && data !== null ? JSON.stringify(data) : data

        if (this.isActive) {
            this.#ws.send(payload)

            this.logger?.debug?.(
                `[WS-${this.#instanceId}] Outgoing message sent (Size: ${payload.length} chars)`,
                { payload },
            )
        } else {
            if (this.messageQueue.length >= this.options.maxQueueSize) {
                const dropped = this.messageQueue.shift()

                this.logger?.warn?.(
                    `[WS-${this.#instanceId}] Queue overflow. Dropped oldest message.`,
                )
            }

            this.messageQueue.push({
                payload: data,
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
        const requestId = crypto.randomUUID?.() || Math.random().toString(36).substring(2, 15)
        const payload = { ...data, requestId }

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                if (this.#responseCallbacks.has(requestId)) {
                    this.#responseCallbacks.delete(requestId)
                    reject(new Error(`[WS-${this.#instanceId}] Request timeout: ${requestId}`))
                }
            }, timeout)

            this.#responseCallbacks.set(requestId, (response) => {
                this.#responseCallbacks.delete(requestId)
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
     * Підписка на події. Повертає функцію для відписки.
     * @param {string} event - Назва події.
     * @param {Function} callback - Обробник.
     * @returns {Function} Unsubscribe function.
     *
     * @example
     * const unmatch = ws.on('data', console.log);
     * // пізніше
     * unmatch();
     */
    on(event, callback) {
        let handlers = this.#eventHandlers.get(event)

        if (!handlers) {
            handlers = new Set()
            this.#eventHandlers.set(event, handlers)
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
        const handlers = this.#eventHandlers.get(event)
        if (handlers) {
            handlers.delete(callback)

            if (handlers.size === 0) {
                this.#eventHandlers.delete(event)
            }
        }
    }

    /**
     * Повне закриття з'єднання та очищення ресурсів.
     */
    close() {
        this.logger?.info?.(`[WS-${this.#instanceId}] Manual disconnect triggered`)
        this.isManualClose = true
        this.#disposeInternalResources()

        // 1. Обробка "завислих" запитів
        if (this.#responseCallbacks.size > 0) {
            this.logger?.debug?.(
                `[WS-${this.#instanceId}] Rejecting ${
                    this.#responseCallbacks.size
                } pending callbacks`,
            )
            this.#responseCallbacks.forEach((callback) => {
                callback.reject(new Error('Connection closed by user'))
            })
            this.#responseCallbacks.clear()
        }

        // 2. Закриття з'єднання
        if (this.#ws) {
            // Видаляємо слухачі, щоб подія onclose не викликала логіку реконнекту випадково
            this.#ws.onclose = null
            this.#ws.onerror = null
            this.#ws.onmessage = null
            this.#ws.onopen = null

            try {
                this.#ws.close(1000, 'Normal Closure')
            } catch (e) {
                this.logger?.error?.('Error during WS close:', e)
            }
            this.#ws = null
        }

        this.#updateStatus(CONNECTION_STATE.DISCONNECTED)

        // 3. Черга повідомлень
        this.messageQueue = []

        // Емітимо подію для UI, щоб він знав, що з'єднання закрито свідомо
        this.#emit('close', { manual: true })
    }

    // --- Private Methods ---

    /**
     * Змінюємо статус підключення
     */
    #updateStatus(newStatus) {
        if (this.connectionStatus !== newStatus) {
            this.connectionStatus = newStatus
            this.#emit('statusChange', newStatus)
        }
    }

    /**
     * Налаштовує детекцію мережі з урахуванням життєвого циклу об'єкта
     */
    #setupNetworkDetection() {
        if (typeof window === 'undefined' || !window.addEventListener) return

        // Зберігаємо посилання для видалення обробника в destroy()
        this._onOnline = () => {
            if (this.isActive || this.isManualClose) return

            this.logger?.info?.(
                `[WS-${this.#instanceId}] Network online detected. Attempting reconnection...`,
            )

            this.connect()
        }

        window.addEventListener('online', this._onOnline)
    }

    /**
     * Прив'язка нативних обробників WebSocket до внутрішньої системи подій.
     * @private
     */
    #bindSocketEvents() {
        if (!this.#ws) return

        this.#ws.onopen = (event) => {
            this.logger?.info?.(`[WS-${this.#instanceId}] ✅ Connection established (OPEN)`)
            this.#updateStatus(CONNECTION_STATE.CONNECTED)
            this.reconnectAttempts = 0
            this.#processMessageQueue()
            this.#startHeartbeat()

            // Trigger custom open handlers
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

            if (typeof data === 'string') {
                try {
                    data = JSON.parse(data)

                    // Обробка системного PONG (якщо сервер шле JSON)
                    if (data.event === 'pong') {
                        this.logger?.debug?.(`[WS-${this.#instanceId}] Pong received (JSON)`)
                        return
                    }

                    // Перевірка патерну Request-Response
                    if (data?.requestId && this.#responseCallbacks.has(data.requestId)) {
                        const resolver = this.#responseCallbacks.get(data.requestId)
                        this.#responseCallbacks.delete(data.requestId)
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

            // Trigger custom message handlers
            this.#emit('message', data)

            // Trigger typed message handlers
            if (data.event) {
                this.#emit(data.event, data)
            }
        }

        this.#ws.on('pong', () => {
            this.#resetPongTimeout()
            this.logger?.debug?.(`[WS-${this.#instanceId}] Protocol Pong received`)
        })

        this.#ws.onerror = (error) => {
            this.logger?.error?.(`[WS-${this.#instanceId}] ❗ WebSocket Error:`, error)
            this.#emit('error', error)
        }

        this.#ws.onclose = (event) => {
            this.logger?.warn?.(
                `[WS-${this.#instanceId}] ⚠️ Disconnected. Code: ${event.code}, Reason: ${
                    event.reason || 'None'
                }`,
            )

            this.#updateStatus(CONNECTION_STATE.DISCONNECTED)
            this.#stopHeartbeat()

            // Trigger custom close handlers
            this.#emit('close', event)

            // Attempt to reconnect if not a normal closure
            if (this.isManualClose && event.code !== 1000 && event.code !== 1001) {
                this.#scheduleReconnection()
            }
        }
    }

    /**
     * Виштовхує накопичені повідомлення з черги після відновлення з'єднання.
     * @private
     */
    async #processMessageQueue() {
        if (this.messageQueue.length === 0) return

        this.logger?.info?.(
            `[WS-${this.#instanceId}] 📤 Flushing queue: ${this.messageQueue.length} items`,
        )

        while (this.messageQueue.length > 0 && this.isActive) {
            const item = this.messageQueue.shift()

            // Перевірка TTL повідомлення
            if (item.expiry && Date.now() > item.expiry) {
                this.logger?.debug?.(
                    `[WS-${this.#instanceId}] Skipped an outdated message from the queue`,
                )
                continue
            }

            this.send(item.payload)

            if (this.options.rateLimitDelay > 0) {
                await new Promise((r) => setTimeout(r, this.options.rateLimitDelay))
            }
        }
    }

    /**
     * Запускає інтервал відправки 'ping'.
     * @private
     */
    #startHeartbeat() {
        this.#stopHeartbeat()

        if (this.options.pingInterval <= 0) return

        this.logger?.info?.(
            `[WS-${this.#instanceId}] Heartbeat started (${this.options.pingInterval}ms)`,
        )

        this.#heartbeatTimer = setInterval(() => {
            if (!this.isActive) return

            // Відправляємо пінг
            this.send({
                event: 'ping',
                timestamp: Date.now(),
            })

            // Якщо використовується бібліотека 'ws' в Node.js, можна слати протокольний пінг:
            if (typeof this.#ws.ping === 'function') {
                this.#ws.ping()
            }

            // Очікуємо понг (якщо не прийде - розриваємо для реконнекту)
            this.#zombieCheckTimer = setTimeout(() => {
                // const timeSinceLastPong = Date.now() - (this.lastPong || 0)
                this.logger?.error?.(
                    `[WS-${this.#instanceId}] 🚨 Pong timeout. Killing connection.`,
                )
                this.#ws?.close()
            }, this.options.serverTimeout)
        }, this.options.heartbeatInterval)
    }

    /**
     *
     */
    #resetPongTimeout() {
        if (this.#zombieCheckTimer) {
            clearTimeout(this.#zombieCheckTimer)
            this.#zombieCheckTimer = null
        }
    }

    /**
     *
     */
    #stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer)
            this.heartbeatTimer = null
        }
        this.#resetPongTimeout()
    }

    /**
     * Планує наступну спробу з'єднання.
     * Реалізує Exponential Backoff з Jitter.
     */
    #scheduleReconnection() {
        if (!this.options.reconnection) return
        if (this.isManualClose) return
        if (this.#reconnectTimer) return

        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            this.logger?.warn?.(
                `[WS-${
                    this.#instanceId
                }] Device offline. Reconnection paused and Waiting for network...`,
            )
            return
        }

        if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
            this.logger?.error?.(
                `[WS-${this.#instanceId}] ❌ Max reconnect attempts reached. (${
                    this.reconnectAttempts
                } attempts).`,
            )
            return
        }

        this.reconnectAttempts++

        // --- Алгоритм Exponential Backoff + Jitter ---
        const baseDelay = Math.min(
            this.options.reconnectionDelayMax,
            this.options.reconnectionDelay *
                Math.pow(this.options.backoffFactor, this.reconnectAttempts - 1),
        )

        const jitterValue = baseDelay * this.options.jitter * (Math.random() * 2 - 1)

        const finalDelay = Math.max(0, baseDelay + jitterValue)

        this.#reconnectTimer = setTimeout(() => {
            this.#reconnectTimer = null
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
                this.reconnectAttempts
            } scheduled at [${timeString}] ` + `(in ${(finalDelay / 1000).toFixed(2)}s)`,
        )
    }

    /**
     *
     */
    #disposeInternalResources() {
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
        const listeners = this.#eventHandlers.get(event)
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
