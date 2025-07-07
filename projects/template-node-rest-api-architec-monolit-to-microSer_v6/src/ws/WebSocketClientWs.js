/**
 * @file WebSocketClient client for robust WebSocket connections with auto-reconnect and ping-pong.
 * @version 1.3.0
 * @author Your Name (or leave as is)
 */

/**
 * @typedef {object} WebSocketClientOptions
 * @property {string} url - The WebSocket URL to connect to. Required.
 * @property {string} [token] - Optional. The authentication token to use. If provided, it overrides any 'token' parameter in the URL.
 * @property {function(): Promise<string|null|undefined>} [getToken] - Optional. An async function that returns a new authentication token. If provided, this function will be called before each connection attempt to get the latest token. It overrides the `token` option.
 * @property {number} [getTokenMaxRetries=3] - Max retries for the `getToken` function itself before considering authentication failed. Only applicable if `getToken` is provided.
 * @property {number} [getTokenRetryDelay=1000] - Base delay (ms) for retries within the `getToken` function.
 * @property {function(): void} [onOpen] - Callback function invoked when the WebSocket connection is successfully opened.
 * @property {function(MessageEvent, object|null): void} [onMessage] - Callback function invoked when a message is received. Receives the raw MessageEvent and a parsed JSON object (if valid).
 * @property {function(number, string): void} [onClose] - Callback function invoked when the WebSocket connection is closed. Receives the close code and reason.
 * @property {function(Event): void} [onError] - Callback function invoked when a WebSocket error occurs. Receives the Event object.
 * @property {function(number, number): void} [onReconnect] - Callback function invoked when a reconnect attempt is made. Receives the current retry attempt number and the delay before the next attempt.
 * @property {function(): void} [onAuthenticationFailed] - Callback invoked if `getToken` repeatedly fails to provide a token, indicating a potential permanent authentication issue.
 * @property {boolean} [autoReconnect=true] - Whether to automatically attempt to reconnect on connection loss.
 * @property {number} [baseDelay=1000] - The base delay (in milliseconds) for reconnect attempts. Used in exponential backoff.
 * @property {number} [maxDelay=30000] - The maximum delay (in milliseconds) for reconnect attempts.
 * @property {number} [maxRetries=Infinity] - The maximum number of reconnect attempts. Set to Infinity for unlimited retries.
 * @property {number} [backoffFactor=2] - The factor by which the delay increases in exponential backoff.
 * @property {number} [pingInterval=15000] - The interval (in milliseconds) for sending client-side pings to keep the connection alive.
 * @property {number} [pongTimeout=5000] - The timeout (in milliseconds) after a ping. If no message (including pong) is received within this time, the connection is considered dead and will be closed.
 * @property {object} [logger=console] - A logger object with `log`, `warn`, `error` methods. Defaults to `console`.
 */

/**
 * Default configuration options for WebSocketClient.
 * @private
 * @type {WebSocketClientOptions}
 */
const DEFAULT_OPTIONS = {
    autoReconnect: true,
    baseDelay: 1000,
    maxDelay: 30000,
    maxRetries: Infinity,
    backoffFactor: 2,
    pingInterval: 15000,
    pongTimeout: 5000,
    logger: console,
    getTokenMaxRetries: 3, // New default
    getTokenRetryDelay: 1000, // New default
}

/**
 * A robust WebSocket client that handles auto-reconnection, exponential backoff with jitter,
 * and client-side ping-pong to maintain a stable connection.
 * It intelligently manages authentication tokens, prioritizing tokens passed in the constructor
 * over those found in the initial URL.
 */
class WebSocketClient {
    /** @private {WebSocket|null} The internal WebSocket instance. */
    #socket = null
    /** @private {boolean} Flag indicating if the connection was manually closed by the user. */
    #isManuallyClosed = false
    /** @private {number} Current number of reconnect attempts for WebSocket connection. */
    #currentWsRetries = 0
    /** @private {number} Current number of reconnect attempts for `getToken` function. */
    #currentGetTokenRetries = 0
    /** @private {string|null|undefined} The current authentication token in use. */
    #currentToken
    /** @private {number} The delay used for the last WebSocket reconnect attempt, for exponential backoff. */
    #lastWsDelay
    /** @private {string[]} Queue for messages to be sent when the connection is open. */
    #messageQueue = []

    /** @private {number|null} Timer ID for sending client pings. */
    #pingTimerId = null
    /** @private {number|null} Timer ID for detecting pong timeouts. */
    #pongTimeoutId = null

    /** @private {string} The base WebSocket URL, without any `token` query parameter. */
    #baseUrl

    /** @private {WebSocketClientOptions} The merged configuration options. */
    #options

    /** @private {function(): Promise<string|null|undefined>|undefined} Optional async function to get the latest token. */
    #getTokenFn

    /**
     * Creates an instance of WebSocketClient.
     * @param {WebSocketClientOptions} options - Configuration options for the WebSocket client.
     * @throws {Error} If `url` is not provided in options.
     */
    constructor({ url, token, getToken, ...userOptions } = {}) {
        if (!url) {
            throw new Error('WebSocketClient: URL is required.')
        }

        // Merge default options with user-provided options
        this.#options = { ...DEFAULT_OPTIONS, ...userOptions }

        const urlObj = new URL(url)
        const initialTokenFromUrl = urlObj.searchParams.get('token')

        // Determine which token source to use:
        // 1. If 'getToken' function is provided, it takes precedence.
        // 2. Otherwise, if 'token' was explicitly passed in constructor options, use that value.
        // 3. Otherwise, use the token found in the URL.
        if (typeof getToken === 'function') {
            this.#getTokenFn = getToken
            urlObj.searchParams.delete('token') // Ensure URL doesn't have token if provider is used
        } else if (Object.prototype.hasOwnProperty.call(userOptions, 'token')) {
            this.#currentToken = token
            urlObj.searchParams.delete('token') // Remove it as we use the one from options
        } else {
            this.#currentToken = initialTokenFromUrl // Use token from URL if 'token' not in options
        }

        // Store the base URL without any 'token' query parameter (it will be added dynamically later)
        this.#baseUrl = urlObj.toString()

        this.#lastWsDelay = this.#options.baseDelay // Initialize last delay for backoff

        this.#connect() // Initiate the first connection attempt
    }

    /**
     * Safely parses a JSON string.
     * @private
     * @param {string} data - The JSON string to parse.
     * @returns {object|null} The parsed JSON object, or null if parsing fails.
     */
    #parseJsonSafe(data) {
        try {
            return JSON.parse(data)
        } catch (error) {
            this.#options.logger.warn(
                `WebSocketClient: Error parsing JSON message: ${error.message}`,
                error,
            )
            return null
        }
    }

    /**
     * Calculates the next delay for WebSocket reconnect attempts using exponential backoff with decorrelated jitter.
     * @private
     * @returns {number} The calculated delay in milliseconds.
     */
    #getDecorrelatedJitterDelay() {
        const minDelay = this.#options.baseDelay
        let maxDelayThisTry = this.#lastWsDelay * this.#options.backoffFactor
        // Limit maxDelayThisTry to not exceed #options.maxDelay
        maxDelayThisTry = Math.min(maxDelayThisTry, this.#options.maxDelay)

        const delay = Math.min(
            this.#options.maxDelay,
            Math.floor(Math.random() * (maxDelayThisTry - minDelay + 1)) + minDelay,
        )
        this.#options.logger.log(
            `Calculated WebSocket reconnect delay: ${delay}ms (attempt ${this.#currentWsRetries})`,
        )
        this.#lastWsDelay = delay
        return delay
    }

    /**
     * Checks if the WebSocket connection is currently open.
     * @returns {boolean} True if the connection is open, false otherwise.
     */
    isOpen() {
        return this.#socket?.readyState === WebSocket.OPEN
    }

    /**
     * Sends all messages from the queue if the connection is open.
     * @private
     */
    #flushQueue() {
        while (this.#messageQueue.length > 0 && this.isOpen()) {
            const message = this.#messageQueue.shift()
            if (message !== undefined) {
                this.#socket.send(message)
                this.#options.logger.debug('WebSocketClient: Sent queued message.')
            }
        }
    }

    /**
     * Starts the client-side ping mechanism to keep the connection alive.
     * Clears any existing ping timers before starting a new one.
     * @private
     */
    #startPingTimers() {
        this.#stopPingTimers() // Ensure previous timers are cleared

        if (this.#options.pingInterval > 0) {
            this.#pingTimerId = setInterval(() => {
                if (this.isOpen()) {
                    this.#pongTimeoutId = setTimeout(() => {
                        this.#options.logger.warn(
                            'WebSocketClient: No message received within pong timeout. Closing socket.',
                        )
                        this.#socket?.close(1000, 'Pong timeout')
                    }, this.#options.pongTimeout)
                }
            }, this.#options.pingInterval)
            this.#options.logger.log(
                `WebSocketClient: Ping timer started (interval: ${
                    this.#options.pingInterval
                }ms, pong timeout: ${this.#options.pongTimeout}ms).`,
            )
        }
    }

    /**
     * Stops all client-side ping and pong timeout timers.
     * @private
     */
    #stopPingTimers() {
        if (this.#pingTimerId !== null) {
            clearInterval(this.#pingTimerId)
            this.#pingTimerId = null
        }
        if (this.#pongTimeoutId !== null) {
            clearTimeout(this.#pongTimeoutId)
            this.#pongTimeoutId = null
        }
        this.#options.logger.log('WebSocketClient: Ping timers stopped.')
    }

    /**
     * Constructs the full WebSocket URL with the current authentication token.
     * @private
     * @returns {string} The complete URL for connection.
     */
    #getWebSocketUrl() {
        const urlObj = new URL(this.#baseUrl)
        if (this.#currentToken) {
            urlObj.searchParams.set('token', this.#currentToken) // Add or replace 'token' parameter
        } else {
            urlObj.searchParams.delete('token') // If #currentToken is null/undefined, ensure no 'token' param
        }
        return urlObj.toString()
    }

    /**
     * Attemps to get a new token using the provided getTokenFn with retries.
     * @private
     * @returns {Promise<boolean>} True if a token was successfully obtained (or not needed), false if max retries reached.
     */
    async #attemptGetToken() {
        if (!this.#getTokenFn) {
            this.#currentToken = null // Ensure no stale token if no getTokenFn
            this.#currentGetTokenRetries = 0 // Reset for potential future getTokenFn setup
            return true // No token function, nothing to do
        }

        while (this.#currentGetTokenRetries < this.#options.getTokenMaxRetries) {
            this.#options.logger.log(
                `WebSocketClient: Requesting new token (attempt ${
                    this.#currentGetTokenRetries + 1
                } of ${this.#options.getTokenMaxRetries})...`,
            )
            try {
                const token = await this.#getTokenFn()
                this.#currentToken = token
                this.#currentGetTokenRetries = 0 // Reset on success
                if (!this.#currentToken) {
                    this.#options.logger.warn(
                        'WebSocketClient: `getToken` function returned no token. Attempting connection without token.',
                    )
                } else {
                    this.#options.logger.log('WebSocketClient: New token obtained successfully.')
                }
                return true // Token successfully obtained or deliberately not provided
            } catch (error) {
                this.#currentGetTokenRetries++
                this.#options.logger.error(
                    `WebSocketClient: Failed to obtain token from \`getToken\` function (attempt ${
                        this.#currentGetTokenRetries
                    }):`,
                    error,
                )

                if (this.#currentGetTokenRetries < this.#options.getTokenMaxRetries) {
                    const delay = this.#options.getTokenRetryDelay * this.#currentGetTokenRetries // Simple linear backoff for getToken
                    this.#options.logger.warn(`WebSocketClient: Retrying getToken in ${delay}ms...`)
                    await new Promise((resolve) => setTimeout(resolve, delay))
                }
            }
        }

        // If we reach here, getTokenMaxRetries has been reached
        this.#options.logger.error(
            'WebSocketClient: Failed to obtain token after multiple retries. Authentication problem?',
        )
        this.#options.onAuthenticationFailed?.() // Notify consumer about auth failure
        this.#currentToken = null // Clear potential stale token
        return false // Could not get a token after retries
    }

    /**
     * Establishes a new WebSocket connection.
     * Handles connection logic, event listeners, and auto-reconnection attempts.
     * @private
     */
    async #connect() {
        // Marked as async because it might await #attemptGetToken
        this.#stopPingTimers() // Clear timers before a new connection attempt

        // First, ensure we have a token (if getTokenFn is provided)
        const tokenObtained = await this.#attemptGetToken()
        if (!tokenObtained && this.#getTokenFn) {
            // If getTokenFn failed and couldn't get a token after retries,
            // we stop the WebSocket connection attempts.
            this.#options.logger.error(
                'WebSocketClient: Aborting WebSocket connection attempts due to repeated getToken failures.',
            )
            this.#isManuallyClosed = true // Prevent further automatic reconnections
            this.#options.onClose?.(1008, 'Authentication token unavailable') // Custom close code for auth issues
            return // Stop here
        }

        const connectionUrl = this.#getWebSocketUrl()
        this.#socket = new WebSocket(connectionUrl)
        this.#options.logger.log(`WebSocketClient: Attempting to connect to ${connectionUrl}`)

        this.#socket.onopen = () => {
            this.#currentWsRetries = 0 // Reset WS retry count on successful connection
            this.#lastWsDelay = this.#options.baseDelay // Reset backoff delay
            this.#isManuallyClosed = false // Reset manual close flag
            this.#options.onOpen?.() // Invoke external onOpen callback
            this.#flushQueue() // Send any queued messages
            // this.#startPingTimers() // Start pinging to keep connection alive
            this.#options.logger.log('WebSocketClient: Connected successfully.')
        }

        this.#socket.onmessage = (e) => {
            // Reset pong timeout on any incoming message, indicating liveness.
            this.#stopPingTimers()
            // this.#startPingTimers()

            const parsed = this.#parseJsonSafe(e.data)
            this.#options.onMessage?.(e, parsed) // Invoke external onMessage callback
        }

        this.#socket.onclose = (event) => {
            this.#stopPingTimers() // Stop pings on close
            this.#options.onClose?.(event.code, event.reason) // Invoke external onClose callback

            this.#options.logger.log(
                `WebSocketClient: Connection closed. Code: ${event.code}, Reason: ${event.reason}`,
            )

            // Attempt to reconnect if not manually closed, auto-reconnect is enabled, and max retries not reached
            if (
                !this.#isManuallyClosed &&
                this.#options.autoReconnect &&
                this.#currentWsRetries < this.#options.maxRetries
            ) {
                this.#currentWsRetries++
                const delay = this.#getDecorrelatedJitterDelay() // Calculate next backoff delay
                this.#options.onReconnect?.(this.#currentWsRetries, delay) // Invoke external onReconnect callback
                this.#options.logger.warn(
                    `WebSocketClient: Reconnecting in ${delay}ms (attempt ${
                        this.#currentWsRetries
                    } of ${
                        this.#options.maxRetries === Infinity
                            ? 'infinity'
                            : this.#options.maxRetries
                    }).`,
                )
                // setTimeout calls #connect, which will re-run the token acquisition logic
                setTimeout(() => this.#connect(), delay)
            } else if (this.#isManuallyClosed) {
                this.#options.logger.log(
                    'WebSocketClient: Connection closed manually, no reconnect.',
                )
            } else {
                this.#options.logger.error(
                    'WebSocketClient: Maximum WebSocket reconnect attempts reached or auto-reconnect disabled. Connection permanently closed.',
                )
            }
        }

        this.#socket.onerror = (err) => {
            this.#options.onError?.(err) // Invoke external onError callback
            this.#options.logger.error('WebSocketClient: WebSocket Error:', err)
            // The 'error' event typically precedes a 'close' event, so reconnect logic is primarily in onclose.
        }
    }

    /**
     * Sends a message through the WebSocket. If the connection is not open, the message is queued.
     * @param {string|ArrayBufferLike|Blob|ArrayBufferView} msg - The message to send.
     * @returns {boolean} True if the message was sent immediately, false if it was queued.
     */
    send(msg) {
        if (this.isOpen()) {
            this.#socket.send(msg)
            this.#options.logger.debug('WebSocketClient: Message sent directly.')
            return true
        } else {
            this.#messageQueue.push(msg)
            this.#options.logger.log('WebSocketClient: Connection not open, message queued.')
            return false
        }
    }

    /**
     * Manually closes the WebSocket connection, preventing auto-reconnection.
     * @param {number} [code=1000] - The WebSocket close code.
     * @param {string} [reason='Client initiated disconnect'] - The reason for closing.
     */
    close(code = 1000, reason = 'Client initiated disconnect') {
        this.#isManuallyClosed = true // Set flag to prevent auto-reconnect
        this.#stopPingTimers() // Ensure timers are cleared
        this.#currentWsRetries = 0 // Reset WS reconnect count on manual close

        if (
            this.#socket &&
            (this.#socket.readyState === WebSocket.OPEN ||
                this.#socket.readyState === WebSocket.CONNECTING)
        ) {
            this.#socket.close(code, reason)
            this.#options.logger.log(
                `WebSocketClient: Initiating manual close (Code: ${code}, Reason: ${reason}).`,
            )
        } else {
            this.#options.logger.warn(
                'WebSocketClient: Socket is not in a suitable state to be closed.',
            )
            this.#options.onClose?.(code, reason)
        }
    }

    /**
     * Updates the authentication token. If a `getToken` function was provided in options,
     * this method will log a warning as the token is managed by the `getToken` function.
     * Otherwise, it updates the internal token and forces a reconnect if the token changed.
     * @param {string|null|undefined} newToken - The new token to use. Can be null or undefined to remove the token.
     */
    updateToken(newToken) {
        if (this.#getTokenFn) {
            this.#options.logger.warn(
                'WebSocketClient: `updateToken` called but `getToken` function is provided. Token management is handled by `getToken` function. If you need to force re-authentication, call `close()` then allow auto-reconnect to trigger `getToken`.',
            )
            return
        }

        if (this.#currentToken === newToken) {
            this.#options.logger.log('WebSocketClient: Token unchanged. No reconnection needed.')
            return
        }
        this.#currentToken = newToken
        this.#options.logger.log('WebSocketClient: Token updated. Reconnecting to apply new token.')

        this.#isManuallyClosed = false // Allow reconnect logic to run
        if (this.isOpen()) {
            this.close(1000, 'Token refreshed, reconnecting')
        } else {
            this.#connect()
        }
    }

    /**
     * Returns the raw WebSocket object for direct access.
     * Use with caution, as direct manipulation might interfere with WebSocketClient's logic.
     * @returns {WebSocket|null} The underlying WebSocket object, or null if not connected.
     */
    get rawSocket() {
        return this.#socket
    }

    /**
     * Exposes the current connection state.
     * @returns {number | undefined} The readyState of the underlying WebSocket, or undefined if no socket exists.
     * @see https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/readyState
     */
    get readyState() {
        return this.#socket?.readyState
    }
}

//
export default WebSocketClient

// <=================== Example =====================>

// // Просто для симуляції логування в UI
// const messagesDiv = document.getElementById('messages')
// const connectionStatusSpan = document.getElementById('connectionStatus')

// function logMessage(text, type = 'system') {
//     const p = document.createElement('p')
//     p.classList.add('message-item', `${type}-message`)
//     p.textContent = `[${new Date().toLocaleTimeString()}] ${text}`
//     messagesDiv.appendChild(p)
//     messagesDiv.scrollTop = messagesDiv.scrollHeight // Прокрутка до низу
// }

// let CURRENT_AUTH_TOKEN = 'initial_valid_token_123' // Симулюємо токен
// let SIMULATE_GET_TOKEN_FAILURE = false // Прапорець для симуляції помилки getToken
// let GET_TOKEN_FAILURE_COUNT = 0 // Лічильник помилок для getToken

// // =======================================================
// // Асинхронна функція для отримання/оновлення токена
// // Тепер з вбудованою симуляцією помилок!
// // =======================================================
// async function getAuthTokenFromBackend() {
//     logMessage('Запит на отримання/оновлення токена до бекенду...', 'system')

//     // Симуляція мережевого запиту до вашого бекенду
//     return new Promise((resolve, reject) => {
//         setTimeout(() => {
//             if (SIMULATE_GET_TOKEN_FAILURE && GET_TOKEN_FAILURE_COUNT < 2) {
//                 // Симулюємо 2 послідовні помилки
//                 GET_TOKEN_FAILURE_COUNT++
//                 logMessage(
//                     `Симулюю помилку отримання токена (спроба: ${GET_TOKEN_FAILURE_COUNT})`,
//                     'system',
//                 )
//                 reject(new Error('Simulated network error or invalid credentials'))
//                 return
//             }

//             // Якщо ми дійшли сюди, або SIMULATE_GET_TOKEN_FAILURE вимкнений,
//             // або ми вже перевищили кількість симульованих помилок.
//             GET_TOKEN_FAILURE_COUNT = 0 // Скидаємо лічильник помилок getToken
//             const newToken = `refreshed_token_${Date.now()}`
//             CURRENT_AUTH_TOKEN = newToken
//             logMessage(`Отримано новий токен: ${newToken.substring(0, 15)}...`, 'system')
//             resolve(newToken)
//         }, 1500) // Затримка 1.5 секунди для симуляції мережевої затримки
//     })
// }

// // =======================================================
// // Ініціалізація WebSocketClient
// // =======================================================
// const ws = new WebSocketClient({
//     url: 'ws://localhost:8080/ws', // Замініть на реальний URL вашого WebSocket сервера
//     getToken: getAuthTokenFromBackend, // Передаємо нашу функцію-провайдер токена
//     getTokenMaxRetries: 3, // Дозволяємо getToken 3 власні спроби
//     getTokenRetryDelay: 1000, // Затримка 1 секунда між спробами getToken

//     pingInterval: 5000,
//     pongTimeout: 3000,
//     baseDelay: 500,
//     maxDelay: 10000,
//     maxRetries: 50,

//     // Колбеки для подій
//     onOpen: () => {
//         connectionStatusSpan.textContent = 'Підключено'
//         connectionStatusSpan.style.color = 'green'
//         logMessage("WebSocket з'єднання відкрито!", 'system')
//     },
//     onMessage: (event, parsed) => {
//         if (parsed) {
//             logMessage(`Отримано JSON: ${JSON.stringify(parsed)}`, 'received')
//         } else {
//             logMessage(`Отримано текст: ${event.data}`, 'received')
//         }
//     },
//     onClose: (code, reason) => {
//         connectionStatusSpan.textContent = 'Відключено'
//         connectionStatusSpan.style.color = 'red'
//         logMessage(`WebSocket з'єднання закрито. Код: ${code}, Причина: ${reason}`, 'system')

//         if (code === 1008 && reason === 'Authentication token unavailable') {
//             connectionStatusSpan.textContent = 'Аутентифікація невдала'
//             connectionStatusSpan.style.color = 'darkred'
//             logMessage(
//                 '**КРИТИЧНО: Не вдалося отримати дійсний токен для автентифікації. Перевірте облікові дані.**',
//                 'system',
//             )
//         }
//     },
//     onError: (event) => {
//         connectionStatusSpan.textContent = 'Помилка'
//         connectionStatusSpan.style.color = 'orange'
//         logMessage(`WebSocket помилка: ${event.message || event.type}`, 'system')
//     },
//     onReconnect: (attempt, delay) => {
//         connectionStatusSpan.textContent = `Перепідключення... (Спроба: ${attempt})`
//         connectionStatusSpan.style.color = 'purple'
//         logMessage(`Спроба перепідключення #${attempt} через ${delay} мс...`, 'system')
//     },
//     onAuthenticationFailed: () => {
//         // Новий колбек для помилок аутентифікації
//         connectionStatusSpan.textContent = 'Аутентифікація невдала'
//         connectionStatusSpan.style.color = 'darkred'
//         logMessage(
//             '**КРИТИЧНО: `getToken` функція багаторазово не змогла отримати токен. Зупинка автоматичних перепідключень.**',
//             'system',
//         )
//         // Тут ви можете перенаправити користувача на сторінку входу або вивести модальне вікно
//     },
// })

// // =======================================================
// // Взаємодія з UI
// // =======================================================
