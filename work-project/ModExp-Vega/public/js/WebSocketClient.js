/**
 * Словник станів з'єднання (Connection Lifecycle States)
 */
export const CONNECTION_STATE = {
    IDLE: 'IDLE',
    CONNECTING: 'CONNECTING',
    CONNECTED: 'OPEN',
    DISCONNECTING: 'CLOSING',
    DISCONNECTED: 'CLOSED',
}

export const WS_AUTH_MODE = {
    QUERY: 'QUERY', // ?token=...
    SUB_PROTOCOL: 'SUB_PROTOCOL', // [token]
    MESSAGE: 'MESSAGE', // { action: 'auth', token: ... }
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
export class WebSocketClient {
    #ws = null
    #reconnectTimer = null
    #heartbeatTimer = null
    #zombieCheckTimer = null
    #eventHandlers = new Map()
    #responseCallbacks = new Map()
    #instanceId = null
    #onOnlineHandler = null
    #onOfflineHandler = null
    #refreshPromise = null

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

            // Налаштування безпеки (Access/Refresh)
            authMode: WS_AUTH_MODE.SUB_PROTOCOL,
            authConfig: {
                mode: 'TEMPORARY', // 'ACCESS'
                queryKey: 'token',
                getAccessToken: null,
                refreshTokens: null,
            },

            heartbeatInterval: 30000,
            serverTimeout: 5000,
            rateLimitDelay: 50, //messageRateLimit: 50,
            maxQueueSize: 100,
            binaryType: 'blob',
            ...options,
        }

        this.reconnectAttempts = 0
        this.messageQueue = []
        this.isManualClose = false
        this.connectionStatus = CONNECTION_STATE.DISCONNECTED

        this.logger?.info?.(`[WS-${this.#instanceId}] Initialized for ${url}`)
        this.#setupNetworkDetection()
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
            let protocols = undefined

            let token = null

            // Сценарій 1: Користувач обрав новий спосіб (TEMPORARY)
            if (this.options.authConfig.mode === 'TEMPORARY') {
                this.logger?.debug?.(`🎟️ [WS] Запит тимчасового квитка для підключення...`)
                token = await this.options.authConfig.getAccessToken()

                // Якщо новий спосіб впав, а користувач дозволив ЗАПАСНИЙ варіант
                if (!token) {
                    throw new Error('Не вдалося отримати тимчасовий квиток для WebSocket.')
                }
            } /*else {
                // 🔥 Токен-інтерцептор: отримуємо актуальний токен (або true для кук)
                token = await this.#getOrRefreshAccessToken(false)

                // 🛑 ЗАХИСТ ВІД DDOS: Якщо сесія мертва (рефреш впав) — скасовуємо коннект
                if (!token) {
                    this.logger?.error?.(
                        `[WS-${this.#instanceId}] Stop connecting. Token refresh failed.`,
                    )
                    this.#updateStatus(CONNECTION_STATE.UNAUTHORIZED)
                    this.#emit('unauthorized', { reason: 'Session totally expired before connect' })
                    return
                }
            }*/

            // --- 🌟 ОБРОБКА 3-Х ВАРІАНТІВ АВТОРИЗАЦІЇ ---
            if (token && typeof token === 'string') {
                if (this.options.authMode === WS_AUTH_MODE.QUERY) {
                    const separator = connectionUrl.includes('?') ? '&' : '?'
                    connectionUrl = `${connectionUrl}${separator}${this.options.authConfig.queryKey}=${encodeURIComponent(token)}`
                } else if (this.options.authMode === WS_AUTH_MODE.SUB_PROTOCOL) {
                    protocols = [token] // Передаємо як нативний субпротокол
                }
            }

            this.logger?.info?.(`[WS-${this.#instanceId}] Connecting to ${connectionUrl}`)

            // Ініціалізуємо WebSocket з протоколами або без
            this.#ws = protocols
                ? new WebSocket(connectionUrl, protocols)
                : new WebSocket(connectionUrl)

            this.#ws.binaryType = this.options.binaryType

            this.#bindSocketEvents()
        } catch (error) {
            this.logger?.error?.(`[WS-${this.#instanceId}] Connection setup failed:`, error)
            this.#updateStatus(CONNECTION_STATE.DISCONNECTED)

            // 🛡️ АНТИ-ДДОС ФІЛЬТР: Перевіряємо статус помилки HTTP
            if (error.status === 401 || error.status === 403) {
                this.logger?.error?.(
                    `🔒 [WS-${this.#instanceId}] Критична помилка авторизації (${error.status}). Сесія недійсна. Реконнект ЗАБЛОКОВАНО.`,
                )

                // Повністю зупиняємо сокет. Користувачу потрібно буде знову пройти авторизацію через інтерфейс.
                this.isManualClose = true
                return
            }

            // Якщо сервер лежить (500, 502, 504) або впала мережа (TypeError)
            if (error.status >= 500 || !error.status) {
                this.logger?.warn?.(
                    `⚠️ [WS-${this.#instanceId}] Сервер недоступний або мережа впала. Запуск безпечного реконнекту.`,
                )

                // Рекомендується використовувати Експоненційне зростання затримки (Exponential Backoff)
                // щоб не спамити сервер, який щогодини намагається піднятися.
                this.#scheduleReconnection()
                return
            }

            // Для всіх інших базових помилок

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

            this.#responseCallbacks.set(requestId, {
                resolve: (response) => {
                    clearTimeout(timer)
                    resolve(response)
                },
                reject: (err) => {
                    clearTimeout(timer)
                    reject(err)
                },
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
            this.#responseCallbacks.forEach((resolver) => {
                resolver.reject(new Error('Connection closed by user'))
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
            } catch (err) {
                this.logger?.error?.('Error during WS close:', err)
            }
            this.#ws = null
        }

        this.#updateStatus(CONNECTION_STATE.DISCONNECTED)

        // 3. Черга повідомлень
        this.messageQueue = []

        // Емітимо подію для UI, щоб він знав, що з'єднання закрито свідомо
        this.#emit('close', { manual: true })
    }

    //
    destroy() {
        this.close()
        if (typeof window !== 'undefined' && this.#onOnlineHandler) {
            window.removeEventListener('online', this.#onOnlineHandler)
        }
        this.#eventHandlers.clear()
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

        this.#onOnlineHandler = () => {
            this.logger?.info?.(`[WS-${this.#instanceId}] Browser signaled: ONLINE`)

            if (this.isActive || this.isManualClose) return

            this.logger?.info?.(`[WS-${this.#instanceId}] Network online. Reconnecting...`)
            this.connect()
        }

        this.#onOfflineHandler = () => {
            this.logger?.info?.(`[WS-${this.#instanceId}] Browser signaled: OFFLINE`)
        }

        window.addEventListener('online', this.#onOnlineHandler)
        window.addEventListener('offline', this.#onOfflineHandler)
    }

    /**
     * Прив'язка нативних обробників WebSocket до внутрішньої системи подій.
     * @private
     */
    #bindSocketEvents() {
        if (!this.#ws) return

        this.#ws.onopen = async (event) => {
            this.logger?.info?.(`[WS-${this.#instanceId}] ✅ Tunnel opened. (OPEN)`)

            // 🌟 РЕЖИМ АВТОРИЗАЦІЇ 3: MESSAGE MODE
            if (this.options.authMode === WS_AUTH_MODE.MESSAGE) {
                this.logger?.info?.(
                    `[WS-${this.#instanceId}] Resolving authorization token for message...`,
                )

                const token = await this.#getOrRefreshAccessToken(false)

                if (!token) {
                    this.logger?.error?.(
                        `[WS-${this.#instanceId}] Token refresh failed during onopen. Closing socket.`,
                    )
                    this.#ws.close(4401, 'Auth Token Expired')
                    return
                }

                if (typeof token === 'string') {
                    this.send({
                        action: 'auth',
                        headers: { Authorization: `Bearer ${token}` },
                    })
                }
            }

            this.#updateStatus(CONNECTION_STATE.CONNECTED)
            this.reconnectAttempts = 0
            this.#processMessageQueue()
            // this.#startHeartbeat()

            // Trigger custom open handlers
            this.#emit('open', event)
        }

        this.#ws.onmessage = async (event) => {
            this.#resetPongTimeout()

            let data = event.data

            // 1. Одразу перевіряємо на системний/текстовий PONG
            if (data === 'pong') {
                this.logger?.trace?.(`[WS-${this.#instanceId}] Protocol Pong received`)
                return // Виходимо, щоб не парсити це як JSON
            }

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
                        this.logger?.trace?.(`[WS-${this.#instanceId}] Pong received (JSON)`)
                        return
                    }

                    // 🌟 Ловимо кастомне повідомлення про прострочений токен у MESSAGE-режимі
                    if (data?.type === 'unauthorized' || data?.error === 'token_expired') {
                        this.logger?.warn?.(
                            `[WS-${this.#instanceId}] Server rejected token via event stream.`,
                        )
                        this.#ws.close(4001, 'Token Expired Message')
                        return
                    }

                    // Перевірка патерну Request-Response
                    if (data?.requestId && this.#responseCallbacks.has(data.requestId)) {
                        const resolver = this.#responseCallbacks.get(data.requestId)
                        this.#responseCallbacks.delete(data.requestId)
                        resolver.resolve(data)
                        return
                    }
                } catch (err) {
                    this.logger?.trace?.(
                        `[WS-${this.#instanceId}] JSON parse failed, using raw string`,
                        err,
                    )
                }
            }

            // Trigger custom message handlers
            this.#emit('message', data)

            // Trigger typed message handlers
            if (data?.event) {
                this.#emit(data.event, data)
            }
        }

        this.#ws.onerror = (error) => {
            this.logger?.error?.(`[WS-${this.#instanceId}] ❗ WebSocket Error:`, error)
            this.#emit('error', error)
        }

        this.#ws.onclose = async (event) => {
            this.logger?.warn?.(
                `[WS-${this.#instanceId}] ⚠️ Closed. Code: ${event.code}, Reason: ${event.reason || 'None'}`,
            )

            this.#updateStatus(CONNECTION_STATE.DISCONNECTED)
            this.#stopHeartbeat()

            // Trigger custom close handlers
            this.#emit('close', event)

            // Якщо це ручне закриття — нічого не робимо
            if (this.isManualClose) return

            // 🌟 КРИТИЧНО ПРИ ПЕРЕПІДКЛЮЧЕННІ: Ловимо статус деавторизації від сервера
            // Кастомні коди (4001, 4401) або стандартний 1008 (Policy Violation)
            const isAuthExpired = [4001, 4401, 1008].includes(event.code)

            if (isAuthExpired) {
                this.logger?.info?.(
                    `[WS-${this.#instanceId}] Auth failure code caught (4401). Intercepting for refresh...`,
                )

                // Примусово запускаємо рефреш
                const token = await this.#getOrRefreshAccessToken(true)

                // 🛑 СТОП-КРАН ОД ДДОСУ: Якщо рефреш повернув null — refresh-токен мертвий!
                if (!token) {
                    this.logger?.error?.(
                        `[WS-${this.#instanceId}] Refresh token expired. Stopping reconnection loop.`,
                    )
                    this.#updateStatus(CONNECTION_STATE.UNAUTHORIZED)
                    this.#emit('unauthorized', { reason: 'Session totally expired' })
                    return // ПОВНИЙ СТОП, реконнект заблоковано!
                }

                this.logger?.info?.(
                    `[WS-${this.#instanceId}] Session refreshed successfully. Proceeding to reconnect.`,
                )
            }

            // Attempt to reconnect if not a normal closure
            if (event.code !== 1000 && event.code !== 1001) {
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

        this.logger?.debug?.(
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
                    `[WS-${this.#instanceId}] 🚨 Pong timeout. Recalling tunnel...`,
                )
                this.#ws?.close(4001, 'Zombie Timeout')
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
        if (this.#heartbeatTimer) {
            clearInterval(this.#heartbeatTimer)
            this.#heartbeatTimer = null
        }
        this.#resetPongTimeout()
    }

    /**
     *
     */
    async #getOrRefreshAccessToken(forceRefresh = false) {
        const config = this.options.authConfig
        const hasGetToken = config && typeof config.getAccessToken === 'function'

        try {
            // 🌟 СЦЕНАРІЙ 1: Звичайне підключення (forceRefresh = false)
            if (!forceRefresh) {
                // Якщо токени в пам'яті/localStorage — перевіряємо їх валідність
                if (hasGetToken) {
                    const token = await config.getAccessToken()
                    if (token && !this.#isJwtExpired(token)) {
                        return token // Токен живий, повертаємо його без зайвих рефрешів
                    }
                    // Якщо токен у пам'яті протух — дозволяємо коду йти нижче на рефреш
                } else {
                    // 💡 ДЛЯ HttpOnly COOKIES: При першому старті просто повертаємо true.
                    // Жодних логів і запитів! Браузер сам відправить куку, яка є.
                    return true
                }
            }

            // Сценарій 2: Токен протух або нас примусово попросили оновитися (forceRefresh при коді 4401)
            if (
                forceRefresh ||
                hasGetToken ||
                (config && typeof config.refreshTokens === 'function')
            ) {
                this.logger?.info?.(
                    `[WS-${this.#instanceId}] Invoking token refresh promise logic...`,
                )

                // Чекаємо завершення синглтон-промісу рефрешу
                const refreshResult = await this.#safeRefresh()

                // Якщо рефреш повернув null — сесія повністю мертва
                if (!refreshResult) {
                    return null
                }

                // Актуалізуємо токен-рядок зі сховища ПІСЛЯ успішного рефрешу
                if (hasGetToken) {
                    const freshToken = await config.getAccessToken()
                    return freshToken || null
                }

                // Якщо getAccessToken немає, значить працюємо на HttpOnly куках. Повертаємо true.
                return true
            }

            // Якщо авторизація на клієнті взагалі відсутня (публічний сервер)
            return true
        } catch (err) {
            this.logger?.error?.(`[WS-${this.#instanceId}] Error during token interception:`, err)
            return null
        }
    }

    /**
     * Безпечна обгортка для рефрешу токенів
     */
    // async #safeRefresh() {
    //     const runRefresh = this.options.authConfig?.refreshTokens

    //     // 1. Перевіряємо, чи функція взагалі існує та чи є вона функцією
    //     if (!runRefresh || typeof runRefresh !== 'function') {
    //         this.logger?.error?.(
    //             '[Auth] Refresh token function is missing or not a function in config',
    //         )
    //         return null // Повертаємо null, щоб onclose зрозумів, що оновитися неможливо, і зупинив DDOS
    //     }

    //     // 2. Якщо запит уже виконується — повертаємо поточний проміс (Request Collapsing)
    //     if (!this.#refreshPromise) {
    //         this.#refreshPromise = runRefresh()
    //             .then((authData) => {
    //                 // Перевіряємо, чи повернувся саме об'єкт і чи є в ньому токен
    //                 if (authData && typeof authData === 'object' && authData.accessToken) {
    //                     return authData // Успіх
    //                 }
    //                 return null // Структура відповіді невалідна
    //             })
    //             .catch((err) => {
    //                 this.logger?.error?.(`[Auth] Critical failure during token refresh:`, err)
    //                 return null // У разі помилки мережі/сервера повертаємо null
    //             })
    //             .finally(() => {
    //                 // Очищаємо посилання для майбутніх циклів оновлення
    //                 this.#refreshPromise = null
    //             })
    //     }

    //     return this.#refreshPromise
    // }

    async #safeRefresh() {
        const runRefresh = this.options.authConfig?.refreshTokens

        if (!runRefresh || typeof runRefresh !== 'function') {
            this.logger?.error?.('[Auth] Refresh token function is missing or invalid in config')
            return null
        }

        // 🌟 Створюємо канал зв'язку між вкладками (назва спільна для всього сайту)
        const channelName = 'ws_auth_refresh_channel'
        const authChannel = new BroadcastChannel(channelName)

        // 1. ПЕРЕВІРКА: Чи не робить якась інша вкладка рефреш прямо зараз?
        if (this.#refreshPromise) {
            authChannel.close()
            return this.#refreshPromise
        }

        // Створюємо проміс, який вирішиться або локальним HTTP запитом, або сигналом з іншої вкладки
        this.#refreshPromise = new Promise(async (resolve) => {
            let receivedFromOtherTab = false

            // Слухаємо повідомлення від сусідніх вкладок
            const messageHandler = (event) => {
                if (event.data?.type === 'REFRESH_SUCCESS') {
                    this.logger?.info?.(
                        `[Auth-${this.#instanceId}] Received refresh success signal from another tab.`,
                    )
                    receivedFromOtherTab = true
                    cleanup()
                    resolve(event.data.payload) // Підхоплюємо дані, які оновила інша вкладка
                } else if (event.data?.type === 'REFRESH_FAILED') {
                    this.logger?.error?.(
                        `[Auth-${this.#instanceId}] Another tab reported refresh failure.`,
                    )
                    receivedFromOtherTab = true
                    cleanup()
                    resolve(null)
                }
            }

            authChannel.addEventListener('message', messageHandler)

            const cleanup = () => {
                authChannel.removeEventListener('message', messageHandler)
                authChannel.close()
            }

            // Даємо мікро-затримку (рандомізовану на 0-50мс), щоб вкладки встигли оголосити про старт
            // і одна з них стала лідером запиту, уникаючи одночасного спаму
            const jitterDelay = 100 + Math.floor(Math.random() * 1400)
            await new Promise((resolve) => setTimeout(resolve, Math.random() * 50))

            // Якщо поки ми чекали, інша вкладка вже успішно віддала нам токен — виходимо
            if (receivedFromOtherTab) return

            // Перевіряємо локальний семафор у localStorage, щоб точно знати, чи ніхто не зайняв чергу
            const now = Date.now()
            const lock = localStorage.getItem('ws_refresh_lock')

            // Якщо локальний лок існує і йому менше 10 секунд — вважаємо, що лідер є, чекаємо на його сигнал
            if (lock && now - parseInt(lock, 10) < 10000) {
                this.logger?.info?.(
                    `[Auth-${this.#instanceId}] Refresh lock active. Waiting for leader tab...`,
                )
                // Ставимо таймаут безпеки, якщо лідер раптом зависне чи вкладку закриють
                setTimeout(() => {
                    if (!receivedFromOtherTab) {
                        this.logger?.warn?.(
                            `[Auth-${this.#instanceId}] Leader tab timeout. Breaking lock.`,
                        )
                        localStorage.removeItem('ws_refresh_lock')
                        cleanup()
                        resolve(null)
                    }
                }, 10000)
                return
            }

            // --- СТАЄМО ЛІДЕРОМ ЗАПИТУ ---
            try {
                localStorage.setItem('ws_refresh_lock', now.toString())
                this.logger?.info?.(
                    `[Auth-${this.#instanceId}] Tab became LEADER. Sending HTTP request...`,
                )

                // Виконуємо реальний HTTP запит до сервера
                const authData = await runRefresh()

                if (authData && typeof authData === 'object' && authData.accessToken) {
                    // Оповіщаємо всі інші вкладки про успіх і передаємо їм дані
                    authChannel.postMessage({ type: 'REFRESH_SUCCESS', payload: authData })
                    cleanup()
                    localStorage.removeItem('ws_refresh_lock')
                    resolve(authData)
                } else {
                    authChannel.postMessage({ type: 'REFRESH_FAILED' })
                    cleanup()
                    localStorage.removeItem('ws_refresh_lock')
                    resolve(null)
                }
            } catch (err) {
                this.logger?.error?.(`[Auth-${this.#instanceId}] Leader tab fetch crashed:`, err)
                authChannel.postMessage({ type: 'REFRESH_FAILED' })
                cleanup()
                localStorage.removeItem('ws_refresh_lock')
                resolve(null)
            }
        }).finally(() => {
            this.#refreshPromise = null
        })

        return this.#refreshPromise
    }

    #isJwtExpired(token) {
        try {
            const parts = token.split('.')
            if (parts.length !== 3) return true
            const payload = JSON.parse(atob(parts.replace(/-/g, '+').replace(/_/g, '/')))
            return payload.exp <= Math.floor(Date.now() / 1000) + 5
        } catch (_) {
            return true
        }
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

        if (
            this.options.maxReconnectAttempts &&
            this.reconnectAttempts >= this.options.maxReconnectAttempts
        ) {
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
