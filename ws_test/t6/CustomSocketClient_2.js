import { EventBus } from './EventBus.js'

/**
 * Професійний WebSocket Клієнтський SDK.
 * Підтримує: Експоненціальний Reconnect, Офлайн-буферизацію, Асинхронні Токени, ACK підтвердження та Метадані.
 */
export class CustomSocketClient {
    /**
     * @param {string} baseUrl - Адреса сервера без query параметрів (наприклад, 'ws://localhost:3000/ws/chat')
     * @param {object} [options={}] - Налаштування клієнта.
     * @param {Function} [options.authProvider] - Асинхронна функція, що повертає об'єкт з параметрами авторизації, наприклад: async () => ({ token: '...' })
     * @param {number} [options.maxReconnectAttempts=Infinity] - Максимальна кількість спроб підключення.
     * @param {number} [options.minReconnectDelay=1000] - Початкова затримка реконнекту в мс.
     * @param {number} [options.maxReconnectDelay=30000] - Максимальна затримка реконнекту в мс.
     */
    constructor(baseUrl, options = {}) {
        this.baseUrl = baseUrl
        this.options = {
            authProvider: options.authProvider || null,
            maxReconnectAttempts: options.maxReconnectAttempts || Infinity,
            minReconnectDelay: options.minReconnectDelay || 1000,
            maxReconnectDelay: options.maxReconnectDelay || 30000,
        }

        this.events = new EventBus()
        this.ws = null
        this.socketId = null

        // Стани підключення
        this.isReady = false // Чи пройдено авторизацію на сервері
        this.isConnecting = false // Чи йде процес фізичного підключення
        this.isClosedManually = false // Чи закрив користувач сокет вручну через .close()

        // Струкутри даних для ACK та реконнекту
        this.ackCallbacks = new Map()
        this.ackCounter = 0
        this.reconnectAttempts = 0
        this.reconnectTimer = null

        // Офлайн-буферизація
        /** @type {Array<{packet: object, resolve: Function, reject: Function}>} Черга повідомлень */
        this.offlineBuffer = []

        this.connect()
    }

    /**
     * Ініціює процес підключення до сервера з урахуванням асинхронної авторизації.
     * @async
     */
    async connect() {
        if (this.isConnecting || this.isReady) return
        this.isConnecting = true

        this.#clearReconnectTimer()

        let authParams = {}
        if (typeof this.options.authProvider === 'function') {
            try {
                // Динамічно беремо свіжий токен перед КОЖНИМ підключенням
                authParams = (await this.options.authProvider()) || {}
            } catch (authError) {
                console.error('[WS SDK] Помилка отримання токена через authProvider:', authError)
                this.isConnecting = false
                this.#handleReconnect() // Пробуємо знову через певний час
                return
            }
        }

        // Будуємо фінальний URL з query параметрами авторизації
        const urlObj = new URL(this.baseUrl)
        Object.entries(authParams).forEach(([key, value]) => {
            urlObj.searchParams.set(key, String(value))
        })

        this.ws = new WebSocket(urlObj.toString())

        this.ws.onopen = () => {
            this.isConnecting = false
            // Мережа відкрита, але чекаємо від сервера подію 'connect' після мідлварів
            console.log('[WS SDK] Мережевий канал відкрито. Очікуємо валідацію токена сервером...')
        }

        this.ws.onmessage = (rawMessage) => {
            // 1. Завжди сповіщаємо систему про нове сире повідомлення
            this.events.emit('message', rawMessage)

            try {
                const parsed = JSON.parse(rawMessage.data)

                // 1. Автоматична відповідь на нативний Highload Heartbeat сервера
                if (parsed.event === '__ping') {
                    if (this.ws.readyState === WebSocket.OPEN) {
                        this.ws.send(JSON.stringify({ event: '__pong', data: {} }))
                    }
                    return
                }

                // 2. Системний сигнал: Успішна авторизація
                if (parsed.event === 'connect') {
                    this.isReady = true
                    this.socketId = parsed.data.socketId
                    this.reconnectAttempts = 0 // Скидаємо лічильник реконнектів при успіху

                    console.log(
                        '[WS SDK] Сигнал CONNECT отримано. Сокет повністю готовий до роботи!',
                    )
                    this.events.emit('connect', { socketId: this.socketId })

                    // Вистрілюємо накопичені офлайн-повідомлення
                    this.#flushOfflineBuffer()
                    return
                }

                // 3. Системний сигнал: Помилка авторизації
                if (parsed.event === 'connect_error') {
                    console.error('[WS SDK] Сервер відхилив токен:', parsed.data.message)
                    this.events.emit('connect_error', parsed.data.message)
                    return
                }

                // 4. Обробка відповідей ACK на наші попередні запити
                if (parsed.isAckResponse) {
                    const cb = this.ackCallbacks.get(parsed.ackId)
                    if (cb) {
                        cb(parsed.data)
                        this.ackCallbacks.delete(parsed.ackId)
                    }
                    return
                }

                // 5. НАЙВАЖЛИВІШЕ: Звичайні бізнес-події від сервера
                if (this.isReady && parsed.event) {
                    let respondFunc = null

                    // Якщо сервер просить нас відповісти (ACK), створюємо функцію-відповідь
                    if (parsed.ackId) {
                        respondFunc = (resData) => {
                            if (this.ws.readyState === WebSocket.OPEN) {
                                this.ws.send(
                                    JSON.stringify({
                                        isAckResponse: true,
                                        ackId: parsed.ackId,
                                        data: resData,
                                    }),
                                )
                            }
                        }
                    }

                    // Завжди передаємо: 1. Дані, 2. Функцію відповіді, 3. Повні метадані від сервера (включаючи nsp та rooms)
                    this.events.emit(parsed.event, parsed.data, respondFunc, parsed.meta || {})
                }
            } catch (err) {
                console.error('[WS SDK] Помилка обробки вхідного пакету:', err)
            }
        }

        this.ws.onclose = (closeEvent) => {
            this.isReady = false
            this.isConnecting = false
            this.socketId = null
            this.ackCallbacks.clear() // Скасовуємо старі очікування ACK

            console.warn(
                `[WS SDK] З'єднання розірвано. Код: ${closeEvent.code}, Причина: ${closeEvent.reason || 'Немає'}`,
            )
            this.events.emit('disconnect', { code: closeEvent.code, reason: closeEvent.reason })

            // Запускаємо авто-реконнект, якщо закриття відбулося не через ручний метод .close()
            if (!this.isClosedManually) {
                this.#handleReconnect()
            }
        }

        this.ws.onerror = (err) => {
            this.events.emit('error', err)
        }
    }

    /**
     * Реалізує логіку експоненціального перепідключення (Exponential Backoff).
     * @private
     */
    #handleReconnect() {
        if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
            console.error('[WS SDK] Вичерпано максимальну кількість спроб перепідключення.')
            this.events.emit('reconnect_failed')
            return
        }

        this.reconnectAttempts++

        // Формула експоненти: початковий_таймаут * 2 в ступені кількості спроб
        // Наприклад: 1000мс -> 2000мс -> 4000мс -> 8000мс... але не більше ніж maxReconnectDelay (30с)
        const delay = Math.min(
            this.options.minReconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
            this.options.maxReconnectDelay,
        )

        console.log(`[WS SDK] Спроба реконнекту #${this.reconnectAttempts} через ${delay}мс...`)
        this.events.emit('reconnecting', this.reconnectAttempts)

        this.reconnectTimer = setTimeout(() => {
            this.connect()
        }, delay)
    }

    /**
     * Очищає активний таймер реконнекту.
     * @private
     */
    #clearReconnectTimer() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer)
            this.reconnectTimer = null
        }
    }

    /**
     * Вистрілює всі повідомлення, які були накопичені в буфері за час офлайну.
     * @private
     */
    #flushOfflineBuffer() {
        if (this.offlineBuffer.length === 0) return
        console.log(
            `[WS SDK] Відновлено зв'язок! Надсилаємо накопичені пакети з офлайн-буфера (${this.offlineBuffer.length}шт)...`,
        )

        const bufferToFlush = [...this.offlineBuffer]
        this.offlineBuffer = []

        bufferToFlush.forEach(({ packet, resolve, reject }) => {
            try {
                // Якщо повідомлення очікувало ACK через Promise (метод timeout)
                if (packet.ackId) {
                    this.ackCallbacks.set(packet.ackId, (resData) => resolve(resData))
                }

                this.ws.send(JSON.stringify(packet))

                // Якщо це був звичайний emit без ACK, просто резолвимо true
                if (!packet.ackId) resolve(true)
            } catch (err) {
                reject(err)
            }
        })
    }

    /**
     * Реєструє слухач подій.
     */
    on(event, callback) {
        this.events.on(event, callback)
    }

    /**
     * Відправляє подію на сервер. Якщо інтернет відсутній — автоматично накопичує пакет у чергу.
     * @param {string} event
     * @param {any} data
     * @param {Function|null} [ackCallback=null]
     * @returns {boolean|Promise} Повертає true якщо надіслано відразу, або Promise якщо пакет ліг у буфер.*/
    emit(event, data, ackCallback = null) {
        const packet = {
            event,
            data,
            meta: {
                id: `cmsg_${Math.random().toString(36).substring(2, 11)}`,
                clientTimestamp: Date.now(),
                socketId: this.socketId,
            },
        }

        if (typeof ackCallback === 'function') {
            if (this.ackCounter >= 9007199254740991) this.ackCounter = 0
            const ackId = ++this.ackCounter
            this.ackCallbacks.set(ackId, ackCallback)
            packet.ackId = ackId
        }

        // ЯКЩО СЕРВЕР ОФЛАЙН АБО ЩЕ НЕ АВТОРИЗОВАНО — НАКОПИЧУЄМО В БУФЕР
        if (!this.isReady || this.ws.readyState !== WebSocket.OPEN) {
            console.warn(
                `[WS SDK] Немає стабільного зв'язку. Повідомлення "${event}" збережено в офлайн-буфер.`,
            )
            return new Promise((resolve, reject) => {
                this.offlineBuffer.push({ packet, resolve, reject })
            })
        }

        // Якщо зв'язок є — шлемо негайно
        this.ws.send(JSON.stringify(packet))
        return true
    }

    /**
     * Відправка повідомлення з асинхронним очікуванням відповіді (Promise) ТА офлайн буферизацією.
     */
    timeout(ms) {
        return {
            emit: (event, data) => {
                return new Promise((resolve, reject) => {
                    if (this.ackCounter >= 9007199254740991) this.ackCounter = 0
                    const ackId = ++this.ackCounter

                    const packet = {
                        event,
                        data,
                        ackId,
                        meta: {
                            id: `cmsg_${Math.random().toString(36).substring(2, 11)}`,
                            clientTimestamp: Date.now(),
                            socketId: this.socketId,
                        },
                    }

                    const timer = setTimeout(() => {
                        if (this.ackCallbacks.has(ackId)) {
                            this.ackCallbacks.delete(ackId)
                            reject(new Error(`Operation timed out after ${ms} ms`))
                        }
                    }, ms)

                    // Якщо зв'язку немає, кладемо в буфер особливу структуру
                    if (!this.isReady || this.ws.readyState !== WebSocket.OPEN) {
                        console.warn(
                            `[WS SDK] Немає зв'язку для Promise-запиту. Запит "${event}" чекає буфера.`,
                        )

                        this.offlineBuffer.push({
                            packet,
                            resolve: (resData) => {
                                clearTimeout(timer)
                                resolve(resData)
                            },
                            reject: (err) => {
                                clearTimeout(timer)
                                reject(err)
                            },
                        })

                        return
                    }

                    // Якщо зв'язок є, реєструємо звичайне очікування
                    this.ackCallbacks.set(ackId, (resData) => {
                        clearTimeout(timer)
                        resolve(resData)
                    })

                    this.ws.send(JSON.stringify(packet))
                })
            },
        }
    }

    /**
     * Повне граціозне ручне закриття з'єднання користувачем.
     */
    close() {
        this.isClosedManually = true
        this.#clearReconnectTimer()
        this.offlineBuffer = []
        this.ackCallbacks.clear()
        if (this.ws) {
            this.ws.close(1000, 'Manually closed by client')
        }
    }
}
