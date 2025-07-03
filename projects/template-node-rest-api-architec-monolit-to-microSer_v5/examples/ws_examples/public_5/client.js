// public/client.js

/**
 * @typedef {object} WebSocketClientOptions
 * @property {string} url - URL WebSocket сервера, включаючи префікс та неймспейс (наприклад, 'ws://localhost:3000/ws/chat').
 * @property {string} token - JWT токен для автентифікації.
 * @property {boolean} [autoReconnect=true] - Чи слід автоматично перепідключатися при розриві з'єднання.
 * @property {number} [baseDelay=1000] - Базова затримка (мс) перед першою спробою перепідключення.
 * @property {number} [maxDelay=30000] - Максимальна затримка (мс) між спробами перепідключення.
 * @property {number} [maxRetries=Infinity] - Максимальна кількість спроб перепідключення.
 * @property {number} [checkInterval=30000] - Інтервал (мс) для перевірки "здоров'я" з'єднання.
 * @property {number} [pingInterval=15000] - Інтервал (мс) для відправки пінг-повідомлень на сервер.
 * @property {number} [pongTimeout=5000] - Час (мс) очікування понг-відповіді від сервера перед закриттям з'єднання.
 * @property {object} [logger] - Об'єкт логера з методами info, warn, error, debug.
 */

/**
 * Простий кастомний EventEmitter для внутрішнього використання.
 * Дозволяє підписуватись на події та викликати їх.
 */
class EventEmitter {
    constructor() {
        this.listeners = {}
    }

    /**
     * Підписується на певну подію.
     * @param {string} event - Назва події.
     * @param {function} listener - Функція-колбек, яка буде викликана при настанні події.
     */
    on(event, listener) {
        if (!this.listeners[event]) {
            this.listeners[event] = []
        }
        this.listeners[event].push(listener)
    }

    /**
     * Відписується від певної події.
     * @param {string} event - Назва події.
     * @param {function} listener - Функція-колбек, яку потрібно видалити.
     */
    off(event, listener) {
        if (!this.listeners[event]) return
        this.listeners[event] = this.listeners[event].filter((l) => l !== listener)
    }

    /**
     * Викликає всі підписані функції для певної події.
     * @param {string} event - Назва події.
     * @param {...any} args - Аргументи, які будуть передані до колбеків.
     */
    emit(event, ...args) {
        if (!this.listeners[event])
            return // Створюємо копію масиву слухачів, щоб уникнути проблем, якщо слухачі видаляються під час ітерації
        ;[...this.listeners[event]].forEach((listener) => {
            try {
                listener(...args)
            } catch (e) {
                console.error(`Error in event listener for ${event}:`, e)
            }
        })
    }
}

/**
 * @class WebSocketClient
 * @extends EventEmitter
 * @description Клієнтський клас для управління WebSocket-з'єднанням з підтримкою JWT-автентифікації,
 * автоматичного перепідключення з експоненційною затримкою, черги повідомлень,
 * механізму пінг-понгів та логування.
 */
class WebSocketClient extends EventEmitter {
    #socket = null // Приватна змінна для екземпляра WebSocket
    #isManuallyClosed = false // Прапорець, що вказує, чи було з'єднання закрито вручну
    #currentRetries = 0 // Лічильник спроб перепідключення
    #currentToken // Поточний JWT токен
    #lastDelay // Остання використана затримка для перепідключення
    #messageQueue = [] // Черга повідомлень для відправки, коли з'єднання буде встановлено
    #checkTimer // Таймер для періодичної перевірки "здоров'я" з'єднання
    #pingTimer // Таймер для відправки пінгів
    #pongTimer // Таймер очікування понг-відповіді
    #logger // Об'єкт логера

    /**
     * Створює екземпляр WebSocketClient.
     * @param {WebSocketClientOptions} options - Налаштування для WebSocketClient.
     */
    constructor(options) {
        super() // Викликаємо конструктор EventEmitter

        this.url = options.url
        this.#currentToken = options.token
        // Зберігаємо всі опції, щоб мати до них доступ
        this.options = {
            autoReconnect: true,
            baseDelay: 1000,
            maxDelay: 30000,
            maxRetries: Infinity,
            checkInterval: 30000,
            pingInterval: 15000,
            pongTimeout: 5000,
            ...options, // Перезаписуємо значення за замовчуванням переданими опціями
        }

        // Ініціалізуємо логер. Якщо не надано, створюємо простий консольний логер.
        this.#logger = this.options.logger || {
            info: (...args) => console.info('[INFO]', ...args),
            warn: (...args) => console.warn('[WARN]', ...args),
            error: (...args) => console.error('[ERROR]', ...args),
            debug: (...args) => console.log('[DEBUG]', ...args),
        }

        this.#lastDelay = this.options.baseDelay // Ініціалізуємо затримку
        this.#connect() // Автоматично починаємо з'єднання при створенні
        this.#startHealthCheck() // Запускаємо перевірку "здоров'я" з'єднання
    }

    /**
     * Генерує випадкову затримку для експоненційного бек-оффу з джиттером.
     * Використовується для перепідключень.
     * @private
     * @returns {number} Затримка в мілісекундах.
     */
    #getDecorrelatedJitterDelay() {
        const { baseDelay, maxDelay } = this.options
        const minDelay = baseDelay
        // Затримка може бути до 3 разів від попередньої, але не більше maxDelay
        const maxDelayThisTry = this.#lastDelay * 3
        const delay = Math.min(
            maxDelay,
            Math.floor(Math.random() * (maxDelayThisTry - minDelay + 1)) + minDelay,
        )
        this.#lastDelay = delay // Зберігаємо для наступної ітерації
        return delay
    }

    /**
     * Очищає чергу повідомлень, відправляючи їх, якщо з'єднання відкрито.
     * @private
     */
    #flushQueue() {
        while (this.#messageQueue.length && this.isOpen()) {
            const message = this.#messageQueue.shift()
            this.#socket.send(message)
            this.#logger.debug(`Message flushed from queue: ${message}`)
        }
    }

    /**
     * Безпечно парсить JSON рядок.
     * @private
     * @param {string} data - JSON рядок для парсингу.
     * @returns {object|null} Розпарсений об'єкт або null, якщо сталася помилка.
     */
    #parseJsonSafe(data) {
        try {
            return JSON.parse(data)
        } catch (e) {
            this.#logger.error(
                `Failed to parse JSON from WebSocket message: ${data}. Error: ${e.message}`,
            )
            return null
        }
    }

    /**
     * Встановлює WebSocket-з'єднання.
     * @private
     */
    #connect() {
        // Якщо сокет вже існує і знаходиться в стані CONNECTING або OPEN, не намагаємося підключитися знову.
        if (
            this.#socket &&
            (this.#socket.readyState === WebSocket.CONNECTING ||
                this.#socket.readyState === WebSocket.OPEN)
        ) {
            this.#logger.warn(
                'WebSocket: Connection already connecting or open. Aborting new connection attempt.',
            )
            return
        }

        const fullUrl = `${this.url}?token=${this.#currentToken}`
        this.#logger.info(`WebSocket: Attempting to connect to ${fullUrl}`)
        this.#socket = new WebSocket(fullUrl)

        // Обробник події "з'єднання встановлено"
        this.#socket.onopen = () => {
            this.#currentRetries = 0 // Скидаємо лічильник спроб при успішному підключенні
            this.#lastDelay = this.options.baseDelay // Скидаємо затримку
            this.emit('open') // Викликаємо подію 'open'
            this.#flushQueue() // Відправляємо всі повідомлення з черги
            this.#startPing() // Запускаємо механізм пінг-понгів
            this.#logger.info(`WebSocket: Successfully connected to ${fullUrl}`)
        }

        // Обробник події "отримано повідомлення"
        this.#socket.onmessage = (event) => {
            this.#logger.debug(`WebSocket: Received raw message: ${event.data}`)
            const parsed = this.#parseJsonSafe(event.data)
            if (parsed?.type === 'pong') {
                clearTimeout(this.#pongTimer) // Очищаємо таймер очікування понг-відповіді
                this.#logger.debug('WebSocket: Pong received, clearing pong timeout.')
                return
            }
            this.emit('message', event.data) // Викликаємо подію 'message', передаючи сирі дані
        }

        // Обробник події "з'єднання закрито"
        this.#socket.onclose = (event) => {
            this.emit('close', event) // Викликаємо подію 'close'
            this.#stopPing() // Зупиняємо механізм пінг-понгів, оскільки з'єднання закрите
            this.#logger.info(
                `WebSocket: Connection closed. Code: ${event.code}, Reason: ${
                    event.reason || 'No reason specified'
                }.`,
            )

            // Логіка автоматичного перепідключення
            if (
                !this.#isManuallyClosed &&
                this.options.autoReconnect &&
                this.#currentRetries < this.options.maxRetries
            ) {
                this.#currentRetries++
                const delay = this.#getDecorrelatedJitterDelay() // Розраховуємо затримку
                this.emit('reconnect', this.#currentRetries, delay) // Викликаємо подію 'reconnect'
                this.#logger.warn(
                    `WebSocket: Attempting reconnect in ${delay}ms (attempt ${
                        this.#currentRetries
                    }/${this.options.maxRetries === Infinity ? '∞' : this.options.maxRetries})...`,
                )
                setTimeout(() => this.#connect(), delay) // Плануємо наступну спробу підключення
            } else if (this.#currentRetries >= this.options.maxRetries) {
                this.#logger.error(
                    'WebSocket: Maximum reconnection attempts reached. Not attempting further reconnects.',
                )
                this.emit('error', new Error('Max reconnection attempts reached.')) // Викликаємо подію 'error'
            }
        }

        // Обробник події "помилка з'єднання"
        this.#socket.onerror = (errorEvent) => {
            this.#logger.error('WebSocket: An error occurred:', errorEvent)
            this.emit('error', errorEvent) // Викликаємо подію 'error'
            // Важливо: зазвичай, після onerror браузер автоматично викликає onclose.
            // Тому явний виклик this.#socket?.close() тут не завжди потрібен.
        }
    }

    /**
     * Запускає періодичну перевірку "здоров'я" WebSocket-з'єднання.
     * Якщо з'єднання не відкрито, воно примусово закривається, що ініціює логіку перепідключення.
     * @private
     */
    #startHealthCheck() {
        // Переконайтесь, що попередній таймер очищено
        this.#stopHealthCheck()
        this.#logger.debug(
            `WebSocket: Starting health check with interval ${this.options.checkInterval}ms.`,
        )
        this.#checkTimer = setInterval(() => {
            // Якщо сокет існує, але не в стані OPEN або CONNECTING, то, ймовірно, є проблема.
            if (
                this.#socket &&
                this.#socket.readyState !== WebSocket.OPEN &&
                this.#socket.readyState !== WebSocket.CONNECTING
            ) {
                this.#logger.warn(
                    'WebSocket: Health check failed - connection not OPEN or CONNECTING. Forcing close for reconnect.',
                )
                this.#socket.close() // Примусове закриття для активації onclose та перепідключення
            } else {
                this.#logger.debug('WebSocket: Health check successful, connection is active.')
            }
        }, this.options.checkInterval)
    }

    /**
     * Зупиняє періодичну перевірку "здоров'я" WebSocket-з'єднання.
     * @private
     */
    #stopHealthCheck() {
        if (this.#checkTimer) {
            clearInterval(this.#checkTimer)
            this.#logger.debug('WebSocket: Health check stopped.')
            this.#checkTimer = null
        }
    }

    /**
     * Запускає механізм пінг-понг для підтримки з'єднання живим та виявлення "мертвих" з'єднань.
     * @private
     */
    #startPing() {
        this.#stopPing() // Завжди очищаємо попередній таймер перед стартом нового
        this.#logger.debug(
            `WebSocket: Starting ping mechanism with interval ${this.options.pingInterval}ms.`,
        )
        this.#pingTimer = setInterval(() => {
            if (this.isOpen()) {
                this.#logger.debug('WebSocket: Sending ping message.')
                this.#socket.send(JSON.stringify({ type: 'ping' })) // Надсилаємо пінг
                // Встановлюємо таймер очікування понг-відповіді
                this.#pongTimer = setTimeout(() => {
                    this.#logger.warn(
                        'WebSocket: No pong received within timeout. Closing connection due to inactivity.',
                    )
                    this.#socket?.close() // Якщо понг не отримано, закриваємо з'єднання
                }, this.options.pongTimeout)
            } else {
                this.#logger.debug('WebSocket: Not sending ping - connection is not open.')
            }
        }, this.options.pingInterval)
    }

    /**
     * Зупиняє механізм пінг-понг.
     * @private
     */
    #stopPing() {
        if (this.#pingTimer) {
            clearInterval(this.#pingTimer)
            this.#pingTimer = null
        }
        if (this.#pongTimer) {
            clearTimeout(this.#pongTimer)
            this.#pongTimer = null
        }
        this.#logger.debug('WebSocket: Ping/pong timers stopped.')
    }

    /**
     * Відправляє повідомлення через WebSocket. Якщо з'єднання не відкрито, повідомлення ставиться в чергу.
     * @public
     * @param {string|ArrayBufferLike|Blob|ArrayBufferView} message - Повідомлення для відправки.
     * @returns {boolean} True, якщо повідомлення було відправлено негайно, false, якщо поставлено в чергу.
     */
    send(message) {
        if (this.isOpen()) {
            this.#socket.send(message)
            this.#logger.debug('WebSocket: Message sent successfully.')
            return true
        } else {
            this.#messageQueue.push(message)
            this.#logger.warn('WebSocket: Connection not open, message queued for later sending.')
            return false
        }
    }

    /**
     * Закриває WebSocket-з'єднання вручну. Це запобігає автоматичному перепідключенню.
     * @public
     */
    close() {
        this.#isManuallyClosed = true // Встановлюємо прапорець ручного закриття
        this.#stopHealthCheck() // Зупиняємо перевірку "здоров'я"
        this.#stopPing() // Зупиняємо пінг-понги
        if (this.#socket) {
            this.#logger.info('WebSocket: Manually closing connection.')
            this.#socket.close()
        } else {
            this.#logger.info('WebSocket: No active connection to close.')
        }
    }

    /**
     * Оновлює JWT токен і примусово перепідключається, якщо з'єднання активне.
     * @public
     * @param {string} newToken - Новий JWT токен.
     */
    updateToken(newToken) {
        if (this.#currentToken === newToken) {
            this.#logger.info('WebSocket: Provided token is the same as current, no update needed.')
            return
        }
        this.#currentToken = newToken
        this.#logger.info('WebSocket: Token updated. Forcing reconnect with new token.')
        // Скидаємо прапорець ручного закриття, щоб дозволити автоматичне перепідключення
        this.#isManuallyClosed = false
        // Закриваємо поточне з'єднання, що викличе onclose, а потім автоматично #connect з новим токеном
        if (
            this.#socket &&
            (this.#socket.readyState === WebSocket.OPEN ||
                this.#socket.readyState === WebSocket.CONNECTING)
        ) {
            this.#socket.close()
        } else {
            // Якщо сокет вже був закритий, просто ініціюємо нове підключення.
            // Це може статися, якщо токен оновлюється під час періоду перепідключення.
            this.#connect()
        }
    }

    /**
     * Перевіряє, чи є WebSocket-з'єднання відкритим.
     * @public
     * @returns {boolean} True, якщо з'єднання відкрито, інакше false.
     */
    isOpen() {
        return this.#socket?.readyState === WebSocket.OPEN
    }

    /**
     * Повертає сирий об'єкт WebSocket. Використовуйте з обережністю.
     * @public
     * @returns {WebSocket|null} Екземпляр WebSocket або null.
     */
    get rawSocket() {
        return this.#socket
    }
}

// =========================================================
// Клієнтська логіка взаємодії з DOM
// =========================================================

// Отримання посилань на DOM-елементи
const usernameInput = document.getElementById('username-input')
const passwordInput = document.getElementById('password-input')
const loginBtn = document.getElementById('login-btn')
const wsUrlInput = document.getElementById('ws-url-input')
const connectBtn = document.getElementById('connect-btn')
const messagesDiv = document.getElementById('messages')
const roomInput = document.getElementById('room-input')
const joinRoomBtn = document.getElementById('join-room-btn')
const leaveRoomBtn = document.getElementById('leave-room-btn')
const messageInput = document.getElementById('message-input')
const sendMessageBtn = document.getElementById('send-message-btn')
const roomInfoDiv = document.getElementById('room-info')

let myJwtToken = null // Змінна для зберігання JWT токену
let myNamespace = null // Змінна для зберігання поточного неймспейсу
let currentRoom = null // Змінна для зберігання назви поточної кімнати
let chatWebSocket = null // Екземпляр WebSocketClient

// Простий консольний логер для клієнтської частини
const appLogger = {
    info: (...args) => console.info('[APP INFO]', ...args),
    warn: (...args) => console.warn('[APP WARN]', ...args),
    error: (...args) => console.error('[APP ERROR]', ...args),
    debug: (...args) => console.log('[APP DEBUG]', ...args),
}

/**
 * Додає повідомлення до DOM-елемента #messages.
 * @param {string} sender - Ім'я відправника (або "Система", "Помилка").
 * @param {string} content - Зміст повідомлення.
 * @param {string} [type='chat_message'] - Тип повідомлення (chat_message, system_message, error).
 */
function appendMessage(sender, content, type = 'chat_message') {
    const messageElement = document.createElement('div')
    messageElement.classList.add('message')
    if (type === 'system_message') {
        messageElement.classList.add('system_message')
    } else if (type === 'error') {
        messageElement.classList.add('error_message')
    }

    if (sender) {
        const senderSpan = document.createElement('span')
        senderSpan.classList.add('sender')
        senderSpan.textContent = sender + ': '
        messageElement.appendChild(senderSpan)
    }
    messageElement.appendChild(document.createTextNode(content))
    messagesDiv.appendChild(messageElement)
    // Прокручуємо донизу, щоб бачити нові повідомлення
    messagesDiv.scrollTop = messagesDiv.scrollHeight
}

/**
 * Обробник для кнопки "Отримати JWT Токен".
 * Відправляє запит на /auth та зберігає отриманий токен.
 */
loginBtn.addEventListener('click', async () => {
    const username = usernameInput.value.trim()
    const password = passwordInput.value.trim()

    if (!username || !password) {
        alert("Будь ласка, введіть ім'я користувача та пароль.")
        return
    }

    appendMessage('Система', 'Спроба автентифікації...', 'system_message')
    try {
        const response = await fetch('/auth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password }),
        })

        const data = await response.json()

        if (response.ok) {
            myJwtToken = data.token // Зберігаємо токен
            appendMessage('Система', 'Автентифікація успішна. Токен отримано!', 'system_message')
            // Оновлюємо стан UI
            loginBtn.disabled = true
            usernameInput.disabled = true
            passwordInput.disabled = true
            connectBtn.disabled = false
            wsUrlInput.disabled = false
            updateButtonStates()
        } else {
            appendMessage('Помилка автентифікації', data.message || 'Невідома помилка.', 'error')
            myJwtToken = null
        }
    } catch (error) {
        appLogger.error('Помилка автентифікації:', error)
        appendMessage(
            'Помилка автентифікації',
            `Не вдалося підключитися до сервера автентифікації: ${error.message}`,
            'error',
        )
        myJwtToken = null
    }
})

/**
 * Обробник для кнопки "Підключитися до WS".
 * Ініціалізує WebSocketClient та підписується на його події.
 */
connectBtn.addEventListener('click', () => {
    if (!myJwtToken) {
        alert('Будь ласка, спочатку автентифікуйтесь, щоб отримати JWT токен.')
        return
    }

    myNamespace = wsUrlInput.value.trim().toLowerCase()
    if (!myNamespace) {
        alert('Будь ласка, введіть назву неймспейсу (наприклад, "chat", "game").')
        return
    }

    // Якщо вже є активне з'єднання, закриваємо його перед створенням нового
    if (
        chatWebSocket &&
        (chatWebSocket.isOpen() || chatWebSocket.rawSocket?.readyState === WebSocket.CONNECTING)
    ) {
        appLogger.info('Existing WebSocket connection detected, closing it before new connection.')
        chatWebSocket.close() // Це викличе onclose, що призведе до повного скидання UI
        chatWebSocket = null
    }

    appendMessage('Система', `Спроба підключення до /ws/${myNamespace}...`, 'system_message')
    appLogger.info(`Creating new WebSocketClient instance for namespace: ${myNamespace}`)

    chatWebSocket = new WebSocketClient({
        url: `ws://localhost:3000/ws/${myNamespace}`,
        token: myJwtToken,
        logger: appLogger, // Передаємо наш консольний логер
        autoReconnect: true,
        maxRetries: 10, // Обмежимо спроби перепідключення до 10
    })

    // Підписка на події WebSocketClient
    chatWebSocket.on('open', () => {
        appendMessage('Система', `Підключено до сервера в неймспейсі /ws/${myNamespace}.`)
        roomInput.disabled = false
        joinRoomBtn.disabled = false
        connectBtn.disabled = true
        wsUrlInput.disabled = true
        roomInfoDiv.textContent = `Підключено до /ws/${myNamespace}. Очікування приєднання до кімнати.`
        updateButtonStates()
    })

    chatWebSocket.on('message', (messageData) => {
        try {
            const data = JSON.parse(messageData)
            // Розбір типів повідомлень від сервера
            switch (data.type) {
                case 'chat_message':
                    appendMessage(data.sender, data.content)
                    break
                case 'system_message':
                    appendMessage('Система', data.content, 'system_message')
                    break
                case 'room_update':
                    // Оновлюємо інформацію про кімнату
                    roomInfoDiv.textContent = `Ви в кімнаті '${
                        data.roomName
                    }' (/ws/${myNamespace}). Користувачів: ${data.userCount} (${data.users.join(
                        ', ',
                    )})`
                    appendMessage(
                        'Система',
                        `Оновлення кімнати '${data.roomName}': Користувачів: ${
                            data.userCount
                        } (${data.users.join(', ')})`,
                        'system_message',
                    )
                    break
                case 'global_announcement':
                    appendMessage('Оголошення', data.content, 'system_message')
                    break
                case 'error':
                    appendMessage('Помилка', data.message, 'error')
                    break
                default:
                    appendMessage(
                        'Система',
                        `Отримано невідоме повідомлення: ${messageData}`,
                        'system_message',
                    )
            }
        } catch (e) {
            appLogger.error(
                `Помилка парсингу або обробки повідомлення: ${messageData}. Помилка: ${e.message}`,
            )
            appendMessage('Помилка', `Невідомий формат повідомлення: ${messageData}`, 'error')
        }
    })

    chatWebSocket.on('close', (event) => {
        appendMessage(
            'Система',
            `Відключено від сервера (/ws/${myNamespace || 'невідомий неймспейс'}). Код: ${
                event.code
            }.`,
        )
        // Скидаємо UI та стан
        messageInput.disabled = true
        sendMessageBtn.disabled = true
        roomInput.disabled = true
        joinRoomBtn.disabled = true
        leaveRoomBtn.disabled = true

        loginBtn.disabled = false
        usernameInput.disabled = false
        passwordInput.disabled = false
        connectBtn.disabled = true // Заблоковано, доки не отримаємо новий токен
        wsUrlInput.disabled = true // Заблоковано

        roomInfoDiv.textContent = 'Відключено.'
        currentRoom = null
        myNamespace = null
        myJwtToken = null // Очищаємо токен, щоб змусити нову автентифікацію
        updateButtonStates()
    })

    chatWebSocket.on('error', (error) => {
        appendMessage(
            'Помилка',
            `WebSocket error: ${error.message || 'Невідома помилка'}.`,
            'error',
        )
    })

    chatWebSocket.on('reconnect', (attempt, delay) => {
        appendMessage(
            'Система',
            `Спроба перепідключення (${attempt}/${
                chatWebSocket.options.maxRetries === Infinity
                    ? '∞'
                    : chatWebSocket.options.maxRetries
            }). Наступна спроба через ${delay}мс.`,
        )
    })
})

/**
 * Обробник для кнопки "Приєднатися".
 * Відправляє запит на приєднання до кімнати.
 */
joinRoomBtn.addEventListener('click', () => {
    if (!chatWebSocket || !chatWebSocket.isOpen()) {
        alert('Спочатку підключіться до сервера.')
        return
    }
    const roomName = roomInput.value.trim()
    if (roomName) {
        // Якщо клієнт вже в кімнаті, спочатку виходимо з неї
        if (currentRoom) {
            appLogger.info(`Leaving current room '${currentRoom}' before joining '${roomName}'.`)
            chatWebSocket.send(JSON.stringify({ type: 'leave_room', roomName: currentRoom }))
        }
        chatWebSocket.send(JSON.stringify({ type: 'join_room', roomName: roomName }))
        currentRoom = roomName // Зберігаємо назву кімнати, до якої намагаємося приєднатися
        // Оновлюємо UI
        messageInput.disabled = false
        sendMessageBtn.disabled = false
        leaveRoomBtn.disabled = false
        joinRoomBtn.disabled = true
        roomInput.disabled = true
        roomInfoDiv.textContent = `Спроба приєднатися до '${roomName}' (/ws/${myNamespace})...`
        updateButtonStates()
    } else {
        alert('Будь ласка, введіть назву кімнати.')
    }
})

/**
 * Обробник для кнопки "Вийти".
 * Відправляє запит на вихід з поточної кімнати.
 */
leaveRoomBtn.addEventListener('click', () => {
    if (!chatWebSocket || !chatWebSocket.isOpen()) {
        alert('Ви не підключені до сервера.')
        return
    }
    if (currentRoom) {
        chatWebSocket.send(JSON.stringify({ type: 'leave_room', roomName: currentRoom }))
        currentRoom = null // Очищаємо поточну кімнату
        // Оновлюємо UI
        messageInput.disabled = true
        sendMessageBtn.disabled = true
        leaveRoomBtn.disabled = true
        joinRoomBtn.disabled = false
        roomInput.disabled = false
        roomInfoDiv.textContent = 'Не приєднано до кімнати.'
        updateButtonStates()
    } else {
        alert('Ви не приєднані до жодної кімнати.')
    }
})

/**
 * Обробник для кнопки "Надіслати" та Enter у полі повідомлення.
 * Відправляє повідомлення у поточну кімнату.
 */
sendMessageBtn.addEventListener('click', sendMessage)
messageInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        sendMessage()
    }
})

function sendMessage() {
    if (!chatWebSocket || !chatWebSocket.isOpen()) {
        alert('Спочатку підключіться до сервера.')
        return
    }
    const message = messageInput.value.trim()
    if (message && currentRoom) {
        chatWebSocket.send(JSON.stringify({ type: 'chat_message', content: message }))
        messageInput.value = '' // Очищаємо поле введення
        updateButtonStates()
    } else if (!currentRoom) {
        alert('Будь ласка, приєднайтеся до кімнати, щоб надсилати повідомлення.')
    } else if (!message) {
        alert('Будь ласка, введіть повідомлення.')
    }
}

/**
 * Оновлює стан кнопок та полів введення на основі поточного стану застосунку.
 */
function updateButtonStates() {
    // Кнопка "Надіслати" активна, якщо є текст у полі повідомлення та користувач у кімнаті
    sendMessageBtn.disabled = !messageInput.value.trim() || !currentRoom
    // Кнопка "Приєднатися" активна, якщо є назва кімнати, сокет відкритий і користувач ще не в кімнаті
    joinRoomBtn.disabled =
        !roomInput.value.trim() || !chatWebSocket || !chatWebSocket.isOpen() || !!currentRoom
    // Кнопка "Вийти" активна, якщо користувач у кімнаті
    leaveRoomBtn.disabled = !currentRoom
    // Кнопка "Підключитися до WS" активна, якщо є токен і введено неймспейс
    connectBtn.disabled = !myJwtToken || !wsUrlInput.value.trim()
}

// Додаємо слухачів подій для полів введення, щоб динамічно оновлювати стан кнопок
messageInput.addEventListener('input', updateButtonStates)
roomInput.addEventListener('input', updateButtonStates)
wsUrlInput.addEventListener('input', updateButtonStates)

/**
 * Ініціалізує початковий стан UI при завантаженні сторінки.
 */
function initializeUI() {
    messageInput.disabled = true
    sendMessageBtn.disabled = true
    roomInput.disabled = true
    joinRoomBtn.disabled = true
    leaveRoomBtn.disabled = true
    connectBtn.disabled = true // Заблоковано, доки не буде JWT
    wsUrlInput.disabled = true // Заблоковано, доки не буде JWT
    roomInfoDiv.textContent = 'Будь ласка, автентифікуйтесь.'
    updateButtonStates() // Встановлюємо початковий стан кнопок
}

// Запускаємо ініціалізацію UI після завантаження DOM
document.addEventListener('DOMContentLoaded', initializeUI)
