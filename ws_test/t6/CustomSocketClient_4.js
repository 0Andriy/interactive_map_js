import { EventBus } from './EventBus.js'

/**
 * Ультимативний Клієнтський WebSocket SDK (Highload & Enterprise Ready).
 * Підтримує: Connection Recovery, Cross-Tab Mutex, нативний Online/Offline трекінг,
 * Експоненціальний Reconnect, Офлайн-буфер повідомлень, ACK-проміси та кастомне логування.
 */
export class CustomSocketClient {
    /**
     * @param {string} baseUrl - Адреса сервера (наприклад, 'ws://localhost:3000/ws/chat')
     * @param {object} [options={}] - Налаштування клієнта.
     * @param {Function} [options.authProvider] - Асинхронна функція авторизації.
     * @param {any} [options.logger] - Опціональний екземпляр логера.
     * @param {number} [options.maxReconnectAttempts=Infinity] - Ліміт спроб реконнекту.
     * @param {number} [options.minReconnectDelay=1000] - Початкова затримка в мс.
     * @param {number} [options.maxReconnectDelay=30000] - Максимальна затримка в мс.
     */
    constructor(baseUrl, options = {}) {
        this.baseUrl = baseUrl

        // Визначаємо середовище (Браузер чи Node.js)
        this.isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined'

        this.options = {
            authProvider: options.authProvider || null,
            maxReconnectAttempts: options.maxReconnectAttempts || Infinity,
            minReconnectDelay: options.minReconnectDelay || 1000,
            maxReconnectDelay: options.maxReconnectDelay || 30000,
            logger: options.logger || null,
        }

        // Налаштування логера за патерном
        const baseLogger = this.options.logger
        this.logger = baseLogger?.child?.({ component: '[WS Client SDK]' }) ??
            baseLogger ?? {
                info: () => {},
                warn: () => {},
                error: () => {},
                debug: () => {},
            }

        this.events = new EventBus({ logger: this.options.logger })
        this.ws = null

        // Сесійні ідентифікатори
        this.socketId = null
        this.lastReceivedMsgId = null // Зберігає ID останнього успішно отриманого повідомлення від сервера

        // Стани підключення
        this.isReady = false // Чи пройдено авторизацію на сервері
        this.isConnecting = false // Чи йде процес фізичного підключення
        this.isClosedManually = false // Чи закрив користувач сокет вручну через .close()

        // Струкутри даних для ACK та реконнекту
        this.ackCallbacks = new Map()
        this.ackCounter = 0

        // Recconect
        this.reconnectAttempts = 0
        this.reconnectTimer = null

        // Офлайн-буферизація
        /** @type {Array<{packet: object, resolve: Function, reject: Function}>} Черга повідомлень */
        this.offlineBuffer = []

        // Налаштовуємо нативні слухачі мережі ОС (тільки для браузера)
        this.#initNetworkAvailabilityListeners()

        this.connect()
    }

    /**
     * Динамічно підключає потрібний клас WebSocket залежно від середовища
     * @private
     */
    async #getWebSocketClass() {
        if (this.isBrowser) {
            return window.WebSocket
        }

        // Якщо ми в Node.js, динамічно імпортуємо бібліотеку 'ws'
        const wsModule = await import('ws')
        return wsModule.default || wsModule.WebSocket
    }

    /**
     * Автоматично відстежує стан мережі пристрою на рівні операційної системи.
     * @private
     */
    #initNetworkAvailabilityListeners() {
        if (!this.isBrowser) return

        // Подія: Інтернет з'явився (вийшли з ліфта)
        window.addEventListener('online', () => {
            this.logger?.info?.(
                'ОС зафіксувала появу інтернету (ONLINE). Перериваємо таймаути, шлемо миттєвий реконнект!',
            )

            if (!this.isReady && !this.isClosedManually) {
                this.connect() // Миттєво ініціюємо підключення без очікування експоненти
            }
        })

        // Подія: Інтернет зник повністю
        window.addEventListener('offline', () => {
            this.logger?.warn?.('ОС зафіксувала повне зникнення інтернету (OFFLINE).')
            this.isReady = false
            this.isConnecting = false
        })
    }

    /**
     * Високотехнологічний механізм Cross-Tab Mutex для браузера.
     * Запобігає одночасному спаму HTTP Refresh запитів від декількох вкладок.
     * @private
     */
    async #executeWithCrossTabMutex(authFn) {
        if (!this.isBrowser || typeof window.BroadcastChannel === 'undefined') {
            return await authFn() // Якщо Node.js або старий браузер — просто виконуємо
        }

        const mutexKey = `ws_mutex_lock:${this.baseUrl}`
        const channel = new BroadcastChannel(mutexKey)
        // Генеруємо унікальний ID для цієї вкладки, щоб уникнути Race Condition
        const tabId = Math.random().toString(36).substring(2, 9)

        const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

        try {
            while (true) {
                const lockOwner = localStorage.getItem(mutexKey)
                const now = Date.now()

                let isFree = !lockOwner
                if (lockOwner) {
                    const [timeStr] = lockOwner.split(':')
                    if (now - parseInt(timeStr, 10) > 10000) isFree = true
                }

                // 1. Якщо лок вільний або застарів
                if (isFree) {
                    // Записуємо мітку часу разом з ID нашої вкладки
                    const claimValue = `${now}:${tabId}`
                    localStorage.setItem(mutexKey, claimValue)

                    // Мікро-пауза, щоб перевірити, чи не було одночасного запису з іншої вкладки
                    await sleep(40)
                    if (localStorage.getItem(mutexKey) !== claimValue) {
                        continue // Хтось інший перехопив лок мілісекундою пізніше, йдемо на нове коло
                    }

                    this.logger?.debug?.(
                        'Вкладка захопила лідерство (Mutex Lock). Виконуємо authProvider...',
                    )

                    try {
                        const result = await authFn()

                        // Повідомляємо інші вкладки в черзі, що ми отримали свіжі токени
                        channel.postMessage({ type: 'AUTH_SUCCESS', data: result })
                        localStorage.removeItem(mutexKey)
                        return result
                    } catch (authError) {
                        // Якщо авторизація зафейлилась — сповіщаємо інші вкладки, щоб вони теж розірвали зв'язок
                        channel.postMessage({
                            type: 'AUTH_FAILED',
                            error: authError.message || 'Auth failed',
                        })
                        localStorage.removeItem(mutexKey)
                        throw authError // Викидаємо помилку далі для поточної вкладки
                    }
                }

                // 2. Якщо лок зайнятий іншою вкладкою — стаємо в чергу прослуховування каналу
                this.logger?.debug?.(
                    'Оновлення токена вже виконується іншою вкладкою. Стаємо в чергу очікування...',
                )

                try {
                    const freshData = await new Promise((resolve, reject) => {
                        let timeoutId

                        const onMessage = (event) => {
                            if (event.data?.type === 'AUTH_SUCCESS') {
                                cleanup()
                                resolve(event.data.data)
                            } else if (event.data?.type === 'AUTH_FAILED') {
                                cleanup()
                                // Перериваємо підключення у цій вкладці, бо лідер зафейлився
                                reject(
                                    new Error(
                                        `Авторизація скасована головною вкладкою: ${event.data.error}`,
                                    ),
                                )
                            }
                        }

                        const cleanup = () => {
                            channel.removeEventListener('message', onMessage)
                            clearTimeout(timeoutId) // Виправляємо витік пам'яті
                        }

                        channel.addEventListener('message', onMessage)

                        // Захисний таймаут, якщо лідер раптово впав чи вкладку закрили
                        timeoutId = setTimeout(() => {
                            cleanup()
                            resolve(null)
                        }, 8000)
                    })

                    if (freshData) return freshData // Успішно отримали токен від сусідньої вкладки!
                } catch (error) {
                    // Прокидаємо помилку авторизації з Promise.reject далі вгору
                    throw error
                }

                await sleep(500) // Якщо лідер зафейлився без повідомлення, відпочиваємо і йдемо на нове коло
            }
        } finally {
            channel.close()
        }
    }

    /**
     * Основний метод підключення до сокет-сервера.
     */
    async connect() {
        if (this.isConnecting || this.isReady) return
        this.isConnecting = true
        this.#clearReconnectTimer()

        let authParams = {}
        if (typeof this.options.authProvider === 'function') {
            try {
                // Викликаємо authProvider через наш розумний Cross-Tab Mutex захист
                authParams = (await this.#executeWithCrossTabMutex(this.options.authProvider)) || {}
            } catch (authError) {
                this.logger?.error?.(
                    'Критична помилка авторизації в authProvider. Підключення скасовано:',
                    authError,
                )

                this.isConnecting = false
                // Важливо: НЕ викликаємо #handleReconnect(), бо сесія мертва.
                // Замість цього сповіщаємо додаток (наприклад, для редиректу на логін)
                this.events.emit('connect_error', authError.message || 'Auth provider failed')
                return
            }
        }

        // Впроваджуємо параметри авторизації в Query string
        const urlObj = new URL(this.baseUrl)
        Object.entries(authParams).forEach(([key, value]) => {
            urlObj.searchParams.set(key, String(value))
        })

        // --- КЛІЄНТСЬКА ЧАСТИНА CONNECTION RECOVERY ---
        // Якщо це не перший старт, а відновлення після розриву — додаємо сесійні мітки
        if (this.socketId && this.lastReceivedMsgId) {
            this.logger?.info?.(
                `[Recovery] Ініціюємо відновлення сесії. Мітки: recover_sid=${this.socketId}, last_msg_id=${this.lastReceivedMsgId}`,
            )
            urlObj.searchParams.set('recover_sid', this.socketId)
            urlObj.searchParams.set('last_msg_id', this.lastReceivedMsgId)
        }

        try {
            const WSClass = await this.#getWebSocketClass()
            this.ws = new WSClass(urlObj.toString())
        } catch (err) {
            this.logger?.error?.('Помилка створення екземпляра WebSocket:', err)
            this.isConnecting = false
            this.#handleReconnect()
            return
        }

        this.ws.onopen = () => {
            this.isConnecting = false
            this.logger?.info?.('Мережевий TCP-канал відкрито. Очікуємо валідацію сервером...')
        }

        this.ws.onmessage = (rawMessage) => {
            // Cповіщаємо систему про нове сире повідомлення
            this.events.emit('message', rawMessage)

            try {
                const parsed = JSON.parse(rawMessage.data)

                // 1. Автоматична відповідь на нативний Highload Heartbeat сервера
                if (parsed.event === '__ping') {
                    if (this.ws.readyState === 1) {
                        // 1 === OPEN
                        this.ws.send(JSON.stringify({ event: '__pong', data: {} }))
                    }
                    return
                }

                // 2. Системний сигнал: Успішна авторизація
                if (parsed.event === 'connect') {
                    this.isReady = true
                    this.socketId = parsed.data.socketId
                    // Скидаємо лічильник реконнектів при успіху
                    this.reconnectAttempts = 0

                    this.logger?.info?.(
                        `Успішна авторизація! Отримано сигнал CONNECT. Socket ID: ${this.socketId}`,
                    )

                    this.events.emit('connect', { socketId: this.socketId })

                    // Вистрілюємо накопичені офлайн-повідомлення
                    this.#flushOfflineBuffer()
                    return
                }

                // 3. Системний сигнал: Помилка авторизації
                if (parsed.event === 'connect_error') {
                    this.logger?.error?.(
                        'Сервер відхилив доступ при авторизації:',
                        parsed.data.message,
                    )

                    this.events.emit('connect_error', parsed.data.message)

                    // КРИТИЧНО: Закриваємо сокет ручками з кастомним кодом (наприклад, 4001 - Unauthorized)
                    // Щоб onclose знав, що реконнектитись не треба
                    this.ws.close(4001, 'Unauthorized')
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
                            if (this.ws.readyState === 1) {
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

                    // КРИТИЧНО ДЛЯ CONNECTION RECOVERY: Фіксуємо ID останнього отриманого повідомлення
                    if (parsed.meta?.id) {
                        this.lastReceivedMsgId = parsed.meta.id
                    }

                    // ЗАВЖДИ ПЕРЕДАЄМО: 1. Дані, 2. Функцію відповіді, 3. Повні метадані (nsp, rooms, msgId)
                    this.events.emit(parsed.event, parsed.data, respondFunc, parsed.meta || {})
                }
            } catch (err) {
                this.logger?.error?.('Помилка обробки вхідного пакету:', err)
            }
        }

        this.ws.onclose = (closeEvent) => {
            this.isReady = false
            this.isConnecting = false
            this.socketId = null
            this.ackCallbacks.clear() // Скасовуємо старі очікування ACK

            this.logger?.warn?.(
                `З'єднання закрито. Код: ${closeEvent.code}, Причина: ${closeEvent.reason || 'Немає'}`,
            )

            this.events.emit('disconnect', { code: closeEvent.code, reason: closeEvent.reason })

            // Якщо код 4401 або будь-який інший > 4000 від гварда
            const isAuthError =
                closeEvent.code === 4401 || closeEvent.code === 4001 || closeEvent.code >= 4000

            // Запускаємо авто-реконнект тільки якщо:
            // 1. Закриття не було ручним через метод клієнта (.isClosedManually)
            // 2. Закриття не викликане помилкою авторизації сервера (код 4001)
            if (!this.isClosedManually && !isAuthError) {
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
        // Перевірка нативного стану мережі: якщо пристрій повністю OFFLINE,
        // зупиняємо чергу таймаутів, бо вони марні. Чекаємо нативного сигналу 'online'
        if (this.isBrowser && !navigator.onLine) {
            this.logger?.warn?.(
                'Пристрій офлайн на рівні ОС. Заморожуємо реконнекти до появи мережі...',
            )
            return
        }

        if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
            this.logger?.error?.('Вичерпано ліміт спроб перепідключення.')
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

        this.logger?.info?.(
            `Спроба реконнекту #${this.reconnectAttempts} запуститься через ${delay}мс...`,
        )

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
     * Вистрілює накопичені офлайн-повідомлення.
     * @private
     */
    #flushOfflineBuffer() {
        if (this.offlineBuffer.length === 0) return
        this.logger?.info?.(
            `Надсилаємо накопичені пакети з офлайн-буфера (${this.offlineBuffer.length}шт)...`,
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
     * @returns {boolean|Promise} Повертає true якщо надіслано відразу, або Promise якщо пакет ліг у буфер.
     */
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
        if (!this.isReady || this.ws.readyState !== 1) {
            this.logger?.warn?.(
                `Повідомлення "${event}" відкладено в офлайн-буфер через відсутність зв'язку.`,
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
     * Асинхронний запит з Promise-ACK та офлайн-буферизацією.
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
                    if (!this.isReady || this.ws.readyState !== 1) {
                        this.logger?.warn?.(
                            `Promise-запит "${event}" збережено в буфер до відновлення зв'язку.`,
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
     * Надсилає подію на сервер та асинхронно чекає на відповідь (ACK) через Promise.
     * Аналог офіційного emitWithAck з socket.io-client.
     * Має вбудований дефолтний таймаут та повну підтримку офлайн-буферизації.
     *
     * @async
     * @param {string} event - Назва бізнес-події.
     * @param {any} data - Корисне навантаження (payload).
     * @param {number} [timeoutMs=10000] - Максимальний час очікування відповіді (за замовчуванням 10 секунд).
     * @returns {Promise<any>} Результат підтвердження від сервера.
     */
    async emitWithAck(event, data, timeoutMs = 10000) {
        // Просто перевикористовуємо наш надійний і протестований конвеєр timeout()
        return this.timeout(timeoutMs).emit(event, data)
    }

    /**
     * Повне граціозне ручне закриття з'єднання користувачем.
     */
    close() {
        this.isClosedManually = true
        this.#clearReconnectTimer()
        this.offlineBuffer = []
        this.ackCallbacks.clear()
        this.socketId = null
        this.lastReceivedMsgId = null

        if (this.ws) {
            this.ws.close(1000, 'Manually closed by client')
        }
    }
}

// Example use

import { CustomSocketClient } from './CustomSocketClient.js'

// --- ЕЛЕМЕНТИ ІНТЕРФЕЙСУ ---
const statusEl = document.getElementById('status')
const chatEl = document.getElementById('chat')
const msgInput = document.getElementById('msgInput')
const sendBtn = document.getElementById('sendBtn')

// --- 1. ОПЦІОНАЛЬНИЙ ЛОГЕР ДЛЯ КЛІЄНТА ---
const clientLogger = {
    info: (msg, ...args) =>
        console.log(`%c[SDK INFO]`, 'color: green; font-weight: bold;', msg, ...args),
    warn: (msg, ...args) =>
        console.warn(`%c[SDK WARN]`, 'color: orange; font-weight: bold;', msg, ...args),
    error: (msg, ...args) =>
        console.error(`%c[SDK ERROR]`, 'color: red; font-weight: bold;', msg, ...args),
    debug: (msg, ...args) => console.debug(`%c[SDK DEBUG]`, 'color: blue;', msg, ...args),
}

// --- 2. АСИНХРОННИЙ ПРОВАЙДЕР ТОКЕНІВ (ОНОВЛЕННЯ ТА MUTEX) ---
const myAuthProvider = async () => {
    clientLogger.debug('Запуск провайдера авторизації...')

    // Сюди можна вставити реальний fetch() для оновлення токенів:
    // const res = await fetch('/api/v1/auth/refresh');
    // const json = await res.json();
    // return { token: json.token };

    return {
        token: 'valid_secret_token_123', // Наш секретний токен для мідлвару сервера
        clientPlatform: 'web_browser',
        tabId: Math.random().toString(36).substring(7),
    }
}

// --- 3. ІНІЦІАЛІЗАЦІЯ КЛІЄНТА ---
// Зверніть увагу: передаємо чистий URL. Параметри з authProvider додадуться самі
const socket = new CustomSocketClient('ws://localhost:3000/ws/chat', {
    authProvider: myAuthProvider,
    logger: clientLogger,
    maxReconnectAttempts: 15,
    minReconnectDelay: 1000,
    maxReconnectDelay: 10000, // Максимум 10 секунд між спробами
})

// Допоміжна функція виведення повідомлень на екран
function appendToChat(text, cssClass = '', metaInfo = '') {
    const p = document.createElement('p')
    p.className = `msg ${cssClass}`
    p.innerHTML = `${text} <span class="meta">${metaInfo}</span>`
    chatEl.appendChild(p)
    chatEl.scrollTop = chatEl.scrollHeight // Авто-скролл донизу
}

// --- 4. ОБРОБКА СТАНІВ ЖИТТЄВОГО ЦИКЛУ МЕРЕЖІ ---

// Подія успішного проходження авторизації (ЛОГІЧНИЙ OPEN)
socket.on('connect', async (data) => {
    statusEl.textContent = `Авторизовано! ID сокета: ${data.socketId}`
    statusEl.className = 'online'

    // Увімкнюємо поля введення
    msgInput.disabled = false
    sendBtn.disabled = false

    appendToChat("🤖 [Система]: З'єднання успішно встановлено та авторизовано.", 'meta')

    // ТЕСТ 1: Робимо Promise-запит часу через метод timeout()
    try {
        appendToChat('⏳ Надсилаємо запит часу на сервер...', 'meta')
        const timeResponse = await socket.timeout(3000).emit('get_server_time', { version: '1.0' })
        appendToChat(
            `🕒 Відповідь сервера через ACK: ${timeResponse.time || JSON.stringify(timeResponse)}`,
            'meta',
        )
    } catch (err) {
        appendToChat(`❌ Сервер не встиг відповісти за 3 секунди: ${err.message}`, 'meta')
    }
})

// Процес підбору експоненціальної затримки реконнекту
socket.on('reconnecting', (attempt) => {
    statusEl.textContent = `Зв'язок перервано. Спроба відновлення #${attempt}...`
    statusEl.className = 'connecting'
})

// Фізичний розрив
socket.on('disconnect', (info) => {
    statusEl.textContent = `Відключено (Код: ${info.code})`
    statusEl.className = 'offline'
})

// Помилка авторизації (наприклад, мідлвар на сервері відхилив токен)
socket.on('connect_error', (errorMessage) => {
    statusEl.textContent = `Помилка доступу: ${errorMessage}`
    statusEl.className = 'offline'
    appendToChat(`⛔ [CORS/Auth Error]: ${errorMessage}`, 'meta')
})

// --- 5. ОБРОБКА ВХІДНИХ БІЗНЕС-ПОДІЙ ВІД СЕРВЕРА ---

// Слухаємо звичайні повідомлення, які розсилає сервер
socket.on('new_message', (payload, callback, meta) => {
    const time = meta.serverTime ? new Date(meta.serverTime).toLocaleTimeString() : ''
    const originInfo = `[Nsp: ${meta.nsp} | Кімната: ${meta.rooms?.join(', ')}] [ID: ${meta.id}] в ${time}`

    appendToChat(`<b>${payload.sender}</b>: ${payload.text}`, '', originInfo)
})

// Слухаємо системні сповіщення про вхід інших користувачів
socket.on('user_joined', (payload) => {
    appendToChat(`👥 Користувач <b>${payload.name}</b> зайшов у кімнату.`, 'meta')
})

// Слухаємо системні сповіщення про вхід інших користувачів
socket.on('user_left', (payload) => {
    appendToChat(`👥 Користувач <b>${payload.name}</b> вийшов з кімнати.`, 'meta')
})

// --- 6. ВІДПРАВКА ПОВІДОМЛЕНЬ (БІЗНЕС-ЛОГІКА КНОПКИ) ---

function handleSendMessage() {
    const text = msgInput.value.trim()
    if (!text) return

    // Автоматичний вхід у кімнату при першому повідомленні (для тесту статистики)
    socket.emit('join_room', 'crypto_traders')

    // Шлемо повідомлення. Завдяки нашому SDK, якщо мережі немає,
    // цей виклик поверне Promise, а повідомлення заляже в безпечний офлайн-буфер!
    const sendResult = socket.emit('send_message', {
        roomName: 'crypto_traders',
        text: text,
    })

    if (sendResult instanceof Promise) {
        appendToChat(
            `📴 [Буфер]: Мережа відсутня. Повідомлення "${text}" збережено в офлайн-чергу.`,
            'meta',
        )
    } else {
        appendToChat(`📤 Надіслано: ${text}`, 'meta')
    }

    msgInput.value = ''
    msgInput.focus()
}

// Прив'язуємо кліки та Enter
sendBtn.addEventListener('click', handleSendMessage)
msgInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSendMessage()
})

//
/*
<!DOCTYPE html>
<html lang="uk">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Highload WebSocket Client</title>
    <style>
        body { font-family: sans-serif; background: #f4f4f9; padding: 20px; }
        #status { padding: 10px; font-weight: bold; border-radius: 5px; margin-bottom: 10px; display: inline-block; }
        .online { background: #d4edda; color: #155724; }
        .offline { background: #f8d7da; color: #721c24; }
        .connecting { background: #fff3cd; color: #856404; }
        #chat { border: 1px solid #ccc; height: 300px; overflow-y: scroll; background: #fff; padding: 10px; margin-bottom: 10px; border-radius: 5px; }
        .msg { margin-bottom: 8px; font-size: 14px; }
        .meta { color: #888; font-size: 11px; margin-left: 5px; }
        input, button { padding: 10px; font-size: 14px; }
        input { width: 300px; border: 1px solid #ccc; border-radius: 4px; }
        button { background: #007bff; color: #fff; border: none; border-radius: 4px; cursor: pointer; }
        button:hover { background: #0056b3; }
    </style>
</head>
<body>

    <h2>Highload Чат Нода</h2>

    <!-- Індикатор стану підключення -->
    <div id="status" class="offline">Офлайн (Спробуйте підключитися)</div>

    <!-- Вікно повідомлень -->
    <div id="chat"></div>

    <!-- Форма відправки -->
    <input type="text" id="msgInput" placeholder="Введіть повідомлення... (Працює і без інтернету)" disabled>
    <button id="sendBtn" disabled>Відправити</button>

    <!-- Підключаємо бізнес-код як модуль -->
    <script type="module" src="./app.js"></script>
</body>
</html>
*/
