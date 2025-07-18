// application.js

import { WebSocketServer } from 'ws' // Для створення WebSocket сервера
import ConnectedClient from './Client.js' // Наш клас ConnectedClient
import Namespace from './Namespace.js' // Наш клас Namespace
import { setupHeartbeat } from './heartbeat.js' // Імпортуємо функцію Heartbeat
import { createLogger } from './logger.js' // Припускаємо, що у вас є файл logger.js з функцією створення логера
import AuthManager from './AuthManager.js' // Імпортуємо AuthManager (jwt)
import { v4 as uuidv4 } from 'uuid' // Для генерації connectionId

/**
 * Клас, що є основним додатком WebSocket сервера.
 * Керує WebSocket-з'єднаннями, маршрутизацією до Namespace та загальним життєвим циклом.
 */
class WebSocketApplication {
    /**
     * @private
     * Унікальний ідентифікатор цього екземпляра WebSocketApplication.
     * @type {string}
     */
    #instanceId

    /**
     * @private
     * Динамічні префікси шляхів для WebSocket-з'єднань.
     * Може бути null, string або string[].
     * @type {string | string[] | null}
     */
    #pathPrefixes

    /**
     * @private
     * WebScoketServer Instance
     * @type {WebSocketServer}
     */
    #wss

    /**
     * @private
     * Об'єкт логера для всього додатка.
     * @type {object}
     */
    #logger

    /**
     * Мапа для зберігання всіх активних ConnectedClient об'єктів.
     * Key: connectionId (string), Value: ConnectedClient
     * @private
     * @type {Map<string, ConnectedClient>}
     */
    #allConnectedClients

    /**
     * Мапа для зберігання всіх активних Namespace об'єктів.
     * Key: namespaceName (string), Value: Namespace
     * @private
     * @type {Map<string, Namespace>}
     */
    #namespaces

    /**
     * @private
     * Конфігурація для дефолтних Namespace.
     * Key: namespaceName (string), Value: object (options for Namespace)
     * @type {Map<string, object>}
     */
    #initialNamespaceConfigs

    /**
     * @private
     * Ім'я дефолтного Namespace.
     * @type {string}
     */
    #defaultNamespaceName

    /**
     * @private
     * Екземпляр AuthManager для керування автентифікацією.
     * @type {AuthManager}
     */
    #authManager

    /**
     * @param {object} [options={}] - Опції для WebSocketApplication.
     * @param {number} [options.port] - Порт, на якому буде слухати WebSocket сервер. Використовується, якщо serverOptions.noServer не встановлено в true.
     * @param {object | null} [options.server=null] - Існуючий HTTP/HTTPS сервер. Обов'язково, якщо serverOptions.noServer: true.
     * @param {string} [options.defaultNamespaceName='default'] - Ім'я дефолтного Namespace, якщо шлях не вказано.
     * @param {object} [options.logger=createLogger('WebSocketApplication')] - Об'єкт логера.
     * @param {object} [options.serverOptions={}] - Додаткові опції для WebSocketServer (наприклад, { noServer: true } для інтеграції з HTTP сервером).
     * @param {Map<string, object>} [options.namespaceConfigs=new Map()] - Кастомні конфігурації для Namespace (ключ: ім'я Namespace, значення: об'єкт опцій для Namespace).
     * @param {object} [options.heartbeatOptions={}] - Опції для механізму Heartbeat (ping/pong).
     */
    constructor({
        port, // Порт тепер опціональний, якщо використовуємо existing server
        server = null, // Існуючий HTTP/HTTPS сервер
        defaultNamespaceName = 'default',
        logger = createLogger('WebSocketApplication'),
        serverOptions = {},
        namespaceConfigs = new Map(),
        heartbeatOptions = {},
        pathPrefixes = null,
    } = {}) {
        this.#instanceId = uuidv4() // Генеруємо унікальний ID для цього екземпляра
        this.#logger = logger
        this.#allConnectedClients = new Map()
        this.#namespaces = new Map()
        this.#initialNamespaceConfigs = namespaceConfigs // Зберігаємо початкові конфігурації
        this.#defaultNamespaceName = defaultNamespaceName // Зберігаємо ім'я дефолтного Namespace
        this.#authManager = new AuthManager(this.#logger)
        this.#pathPrefixes = pathPrefixes // Зберігаємо префікси

        // Встановлюємо опцію noServer в true, якщо надано існуючий сервер
        if (server) {
            serverOptions.noServer = true
            this.#logger.info(
                `[App:${
                    this.#instanceId
                }] WebSocketApplication will attach to an existing HTTP server.`,
            )
        } else if (!serverOptions.noServer && !port) {
            // Якщо немає existing server і noServer не true, порт обов'язковий
            throw new Error(
                'Port must be provided if not attaching to an existing server or using noServer: true.',
            )
        }

        this.#wss = new WebSocketServer({ port, server, ...serverOptions })

        this.#logger.info(`[App:${this.#instanceId}] WebSocketApplication initializing...`)

        // Ініціалізуємо всі Namespace з конфігурації
        this.#initialNamespaceConfigs.forEach((config, name) => {
            this.#createNamespace(name, config)
        })

        // Якщо дефолтний Namespace не був доданий через конфігурацію, додаємо його
        if (!this.#namespaces.has(this.#defaultNamespaceName)) {
            is.#logger.info(
                `[App:${this.#instanceId}] Default namespace '${
                    this.#defaultNamespaceName
                }' not found in initial configs. Creating it.`,
            )
            this.#createNamespace(this.#defaultNamespaceName, {}) // Створюємо дефолтний, якщо його немає
        }

        this.#setupEventHandlers()

        // Передаємо інстанс WebSocketServer, опції Heartbeat та наш логер
        setupHeartbeat(this.#wss, heartbeatOptions, this.#logger, this.#allConnectedClients)

        const addressInfo = this.#wss.address()
        if (addressInfo && typeof addressInfo === 'object' && 'port' in addressInfo) {
            this.#logger.info(
                `[App:${this.#instanceId}] WebSocketApplication ready. Listening on port ${
                    addressInfo.port
                }.`,
            )
        } else {
            this.#logger.info(
                `[App:${
                    this.#instanceId
                }] WebSocketApplication ready. Attached to existing server.`,
            )
        }
    }

    /**
     * Повертає унікальний ідентифікатор цього екземпляра WebSocketApplication.
     * @returns {string}
     */
    get instanceId() {
        return this.#instanceId
    }

    /**
     * Повертає екземпляр WebSocketServer.
     * @returns {WebSocketServer}
     */
    get wss() {
        return this.#wss
    }

    /**
     * Повертає колекцію всіх підключених клієнтів у цьому ws іnstanse.
     * @returns {Map<string, Client>} Колекція, де ключем є ID клієнта,
     * а значенням - об'єкт клієнта.
     */
    get allConnectedClients() {
        return this.#allConnectedClients
    }

    /**
     * Повертає кількість всіх підключених клієнтів.
     * @returns {number}
     */
    get totalClients() {
        return this.#allConnectedClients.size
    }

    /**
     * Повертає екземпляр AuthManager.
     * @returns {AuthManager}
     */
    get authManager() {
        return this.#authManager
    }

    /**
     * Внутрішній метод для створення нового Namespace.
     * @private
     * @param {string} name - Ім'я Namespace.
     * @param {object} config - Конфігурація для Namespace.
     * @returns {Namespace}
     */
    #createNamespace(name, config = {}) {
        if (this.#namespaces.has(name)) {
            this.#logger.warn(
                `[App:${this.#instanceId}] Namespace '${name}' already exists. Skipping creation.`,
                {
                    namespaceName: name,
                },
            )
            return this.#namespaces.get(name)
        }

        this.#logger.info(`[App:${this.#instanceId}] Creating Namespace: '${name}' with config:`, {
            namespaceName: name,
            config: config,
        })
        const newNamespace = new Namespace(name, this.#logger, {
            ...config,
            // onRoomRemoved callback - цей Namespace Manager сам себе викликає для видалення кімнати
            onRoomRemoved: (roomName, namespaceName) => {
                const ns = this.#namespaces.get(namespaceName)
                if (ns) {
                    this.#logger.debug(
                        `[App:${
                            this.#instanceId
                        }] [Application] Room '${roomName}' in Namespace '${namespaceName}' requested removal.`,
                        {
                            roomName: roomName,
                            namespaceName: namespaceName,
                        },
                    )
                    // Namespace вже викликав room.destroy() та видалив її зі своєї Map.
                    // Тут ми можемо логувати або виконати додаткову логіку,
                    // якщо потрібно видаляти Namespace, коли всі його кімнати порожні,
                    // але в нашому випадку Namespace постійні.
                }
            },
        })
        this.#namespaces.set(name, newNamespace)
        return newNamespace
    }

    /**
     * Отримує існуючий Namespace за іменем.
     * @param {string} name - Ім'я Namespace.
     * @returns {Namespace | undefined}
     */
    getNamespace(name) {
        return this.#namespaces.get(name)
    }

    /**
     * Встановлює обробники подій для WebSocket сервера.
     * @private
     */
    #setupEventHandlers() {
        this.#wss.on('connection', (ws, req) => this.#handleConnection(ws, req))
        this.#wss.on('error', (error) => this.#handleServerError(error))
        // 'listening' event is only fired if `noServer` is false
        if (!this.#wss.options.noServer) {
            this.#wss.on('listening', () => {
                this.#logger.info(`[App:${this.#instanceId}] WebSocketServer started listening.`)
            })
        }
        this.#wss.on('close', () => {
            this.#logger.info(`[App:${this.#instanceId}] WebSocketServer closed.`)
        })
    }

    /**
     * Витягує ім'я Namespace з URL шляху, враховуючи необов'язковий префікс '/ws'.
     * Наприклад:
     * - "/ws/chat/room1" -> "chat"
     * - "/chat/room1" -> "chat"
     * - "/ws/game" -> "game"
     * - "/game" -> "game"
     * - "/ws/" -> "default" (або ім'я дефолтного Namespace)
     * - "/" -> "default" (або ім'я дефолтного Namespace)
     * @private
     * @param {string} path - Шлях URL запиту.
     * @returns {string} - Ім'я Namespace.
     */
    #extractNamespaceNameFromPath(path) {
        let cleanPath = path.split('?')[0]

        // Видаляємо початковий слеш
        if (cleanPath.startsWith('/')) {
            cleanPath = cleanPath.substring(1)
        }

        // Перевіряємо наявність динамічних префіксів
        const prefixesToCheck = this.#pathPrefixes
            ? Array.isArray(this.#pathPrefixes)
                ? this.#pathPrefixes
                : [this.#pathPrefixes]
            : []

        for (const prefix of prefixesToCheck) {
            // Перевіряємо, чи шлях починається з префікса (з додаванням '/' наприкінці, щоб уникнути співпадінь типу 'ws' з 'wservice')
            const prefixWithSlash = prefix.endsWith('/') ? prefix : `${prefix}/`
            if (cleanPath.startsWith(prefixWithSlash)) {
                cleanPath = cleanPath.substring(prefixWithSlash.length)
                break // Знайшли та видалили один префікс, далі не перевіряємо
            } else if (cleanPath === prefix) {
                // Обробляємо випадок, коли шлях точно співпадає з префіксом (наприклад, /ws)
                cleanPath = '' // Шлях стає порожнім
                break
            }
        }

        // Розбиваємо шлях на частини
        const parts = cleanPath.split('/').filter((p) => p !== '')

        // Перша не порожня частина є ім'ям Namespace
        if (parts.length > 0) {
            return parts[0]
        }

        // Якщо шлях порожній після всіх маніпуляцій, використовуємо дефолтний Namespace
        return this.#defaultNamespaceName
    }

    /**
     * Обробляє нове WebSocket-з'єднання.
     * @private
     * @param {WebSocket} ws - WebSocket-з'єднання.
     * @param {IncomingMessage} req - HTTP-запит, який ініціював з'єднання.
     */
    #handleConnection(ws, req) {
        const protocol = req.protocol || req.headers['x-forwarded-proto'] || 'http'
        // Парсимо URL запиту для отримання шляху та query параметрів
        const url = new URL(req.url, `${protocol}://${req.headers.host}`)
        const requestedPath = url.pathname
        const authToken = url.searchParams.get('token')

        const namespaceName = this.#extractNamespaceNameFromPath(requestedPath)

        this.#logger.info(
            `[App:${
                this.#instanceId
            }] New client connection request. Path: '${requestedPath}', Proposed Namespace: '${namespaceName}', Token presence: ${!!authToken}'`,
            {
                path: requestedPath,
                namespace: namespaceName,
                tokenPresent: !!authToken,
            },
        )

        const client = new ConnectedClient(ws, this.#logger)
        this.#allConnectedClients.set(client.connectionId, client)

        const decodedToken = this.#authManager.validateToken(authToken)

        if (!decodedToken || !decodedToken.userId) {
            this.#logger.warn(
                `[App:${this.#instanceId}] Client ${
                    client.connectionId
                } authentication failed or token invalid/missing. Disconnecting.`,
                {
                    connectionId: client.connectionId,
                    namespace: namespaceName,
                },
            )
            client.send({
                type: 'AUTH_FAILED',
                payload: 'Invalid or missing authentication token.',
            })
            client.close(4001, 'Authentication Failed') // Використовуємо кастомний код для автентифікації
            this.#allConnectedClients.delete(client.connectionId) // Видаляємо, якщо автентифікація не пройшла
            return
        }

        client.authenticate({ userId: decodedToken.userId })

        let namespace = this.#namespaces.get(namespaceName)
        if (!namespace) {
            // Якщо Namespace не існує і він не був попередньо налаштований як дефолтний
            this.#logger.warn(
                `[App:${
                    this.#instanceId
                }] Namespace '${namespaceName}' not found for path '${requestedPath}'. Using default namespace '${
                    this.#defaultNamespaceName
                }'.`,
                {
                    requestedNamespace: namespaceName,
                    path: requestedPath,
                    defaultNamespace: this.#defaultNamespaceName,
                },
            )
            namespace = this.#namespaces.get(this.#defaultNamespaceName)
            if (!namespace) {
                this.#logger.error(
                    `[App:${this.#instanceId}] Default namespace '${
                        this.#defaultNamespaceName
                    }' not found! This should not happen. Disconnecting client ${
                        client.connectionId
                    }.`,
                    { connectionId: client.connectionId },
                )
                client.close(1011, 'Server error: Default namespace not available.')
                this.#allConnectedClients.delete(client.connectionId)
                return
            }
        }

        namespace.addClient(client) // Додаємо клієнта до відповідного Namespace
        client.setNamespace(namespace) // Встановлюємо посилання на Namespace в ConnectedClient

        this.#logger.info(
            `[App:${this.#instanceId}] Client ${client.connectionId} (User: ${
                client.userId
            }) assigned to Namespace: '${namespace.name}'. Total clients: ${this.totalClients}`,
            {
                connectionId: client.connectionId,
                userId: client.userId,
                namespace: namespace.name,
                totalClients: this.totalClients,
            },
        )

        // Встановлюємо обробники подій для конкретного клієнта
        ws.on('message', (message) => this.#handleClientMessage(client, message))
        ws.on('close', (code, reason) => this.#handleClientClose(client, code, reason))
        ws.on('error', (error) => this.#handleClientError(client, error))
    }

    /**
     * Обробляє вхідні повідомлення від клієнта.
     * @private
     * @param {ConnectedClient} client - Клієнт, від якого надійшло повідомлення.
     * @param {string | Buffer} message - Повідомлення.
     */
    #handleClientMessage(client, message) {
        if (!client.isAuthenticated) {
            this.#logger.warn(
                `[App:${this.#instanceId}] [Client:${
                    client.connectionId
                }] Received message from unauthenticated client. Ignoring.`,
                { connectionId: client.connectionId },
            )
            client.send({ type: 'ERROR', payload: 'Not authenticated.' })
            return
        }

        this.#logger.debug(
            `[App:${this.#instanceId}] [Client:${
                client.connectionId
            }] Received message: ${message.toString()}`,
            {
                connectionId: client.connectionId,
                messageContent: message.toString(),
            },
        )

        // Парсимо повідомлення (припускаємо JSON для структурування)
        let parsedMessage
        try {
            parsedMessage = JSON.parse(message.toString())
        } catch (error) {
            this.#logger.warn(
                `[App:${this.#instanceId}] [Client:${
                    client.connectionId
                }] Failed to parse message as JSON: ${message.toString()}`,
                {
                    connectionId: client.connectionId,
                    rawMessage: message.toString(),
                    error: error.message,
                },
            )
            client.send({ type: 'ERROR', payload: 'Invalid JSON message.' })
            return
        }

        // Знаходимо Namespace, до якого приєднаний цей клієнт
        const targetNamespace = client.namespace // Отримуємо з об'єкта клієнта

        if (!targetNamespace) {
            this.#logger.error(
                `[App:${this.#instanceId}] [Client:${
                    client.connectionId
                }] No associated namespace found for incoming message. Disconnecting client.`,
                { connectionId: client.connectionId },
            )
            client.close(1011, 'No associated namespace')
            this.#allConnectedClients.delete(client.connectionId)
            return
        }

        // Передаємо повідомлення до Namespace для подальшої обробки
        // Namespace обробить його через свій defaultHandler та customHandler
        try {
            targetNamespace.handleEvent({
                type: parsedMessage.type, // Тип повідомлення (наприклад, 'JOIN_ROOM', 'CHAT_MESSAGE')
                payload: parsedMessage.payload, // Вміст повідомлення
                client: client, // Сам об'єкт ConnectedClient
                namespace: targetNamespace,
            })
        } catch (error) {
            this.#logger.error(
                `[App:${this.#instanceId}] [Client:${
                    client.connectionId
                }] Error handling event in Namespace '${targetNamespace.name}': ${error.message}`,
                {
                    connectionId: client.connectionId,
                    namespace: targetNamespace.name,
                    eventType: parsedMessage.type,
                    error: error.message,
                    stack: error.stack,
                },
            )
            client.send({
                type: 'ERROR',
                payload: `Server error processing your request: ${error.message}`,
            })
        }
    }

    /**
     * Обробляє закриття з'єднання клієнтом.
     * @private
     * @param {ConnectedClient} client - Клієнт, який відключився.
     * @param {number} code - Код закриття.
     * @param {Buffer} reason - Причина закриття.
     */
    #handleClientClose(client, code, reason) {
        this.#logger.info(
            `[App:${this.#instanceId}] [Client:${
                client.connectionId
            }] Disconnected. Code: ${code}, Reason: ${reason.toString()}. User ID: ${
                client.userId || 'N/A'
            }`,
            {
                connectionId: client.connectionId,
                userId: client.userId,
                code: code,
                reason: reason.toString(),
            },
        )

        // Видаляємо клієнта з його основного Namespace
        const primaryNamespace = client.namespace
        if (primaryNamespace) {
            primaryNamespace.removeClient(client.connectionId)
            this.#logger.debug(
                `[App:${this.#instanceId}] [Application] Client ${
                    client.connectionId
                } removed from its primary namespace '${primaryNamespace.name}'.`,
                {
                    connectionId: client.connectionId,
                    namespace: primaryNamespace.name,
                },
            )
        } else {
            this.#logger.warn(
                `[App:${this.#instanceId}] [Application] Client ${
                    client.connectionId
                } disconnected but no primary namespace found.`,
                { connectionId: client.connectionId },
            )
        }

        // Очищаємо клієнта з глобальної мапи
        this.#allConnectedClients.delete(client.connectionId)
        this.#logger.info(
            `[App:${this.#instanceId}] Client ${
                client.connectionId
            } removed from global registry. Total clients: ${this.totalClients}`,
            {
                connectionId: client.connectionId,
                totalClients: this.totalClients,
            },
        )
    }

    /**
     * Обробляє помилки, пов'язані з клієнтським з'єднанням.
     * @private
     * @param {ConnectedClient} client - Клієнт, на якому сталася помилка.
     * @param {Error} error - Об'єкт помилки.
     */
    #handleClientError(client, error) {
        this.#logger.error(
            `[App:${this.#instanceId}] [Client:${client.connectionId}] Error: ${error.message}`,
            {
                connectionId: client.connectionId,
                error: error.message,
                stack: error.stack,
            },
        )
        // Можливо, закриваємо з'єднання, якщо помилка критична
        client.close(1011, 'Internal Server Error')
    }

    /**
     * Обробляє помилки на рівні сервера WebSocket.
     * @private
     * @param {Error} error - Об'єкт помилки.
     */
    #handleServerError(error) {
        this.#logger.error(`[App:${this.#instanceId}] WebSocketServer error: ${error.message}`, {
            error: error.message,
            stack: error.stack,
        })
    }

    /**
     * Надсилає повідомлення всім підключеним клієнтам по всіх Namespace.
     * Це глобальний широкомовний метод.
     * @param {string | object} message - Повідомлення для надсилання.
     * @param {string[]} [excludeConnectionIds=[]] - Масив connectionId клієнтів, яких слід виключити.
     * @param {object} [options={}] - Додаткові опції для надсилання (передаються в ConnectedClient.send).
     */
    broadcast(message, excludeConnectionIds = [], options = {}) {
        this.#logger.info(
            `[App:${this.#instanceId}] Broadcasting message to ${
                this.totalClients
            } clients (excluding ${excludeConnectionIds.length}).`,
            {
                totalClients: this.totalClients,
                excludedCount: excludeConnectionIds.length,
                message: typeof message === 'object' ? JSON.stringify(message) : message,
            },
        )
        let sentCount = 0
        for (const client of this.#allConnectedClients.values()) {
            if (!excludeConnectionIds.includes(client.connectionId)) {
                try {
                    client.send(message, options)
                    sentCount++
                } catch (error) {
                    this.#logger.error(
                        `[App:${this.#instanceId}] Error broadcasting message to client ${
                            client.connectionId
                        }: ${error.message}`,
                        {
                            connectionId: client.connectionId,
                            error: error.message,
                        },
                    )
                }
            }
        }
        this.#logger.debug(
            `[App:${this.#instanceId}] Broadcast message sent to ${sentCount} clients globally.`,
            {
                sentCount: sentCount,
            },
        )
    }

    /**
     * Зупиняє WebSocket сервер та очищає всі ресурси.
     */
    async stop() {
        this.#logger.info(`[App:${this.#instanceId}] Shutting down WebSocketApplication...`)
        // Закриваємо всі клієнтські з'єднання
        for (const client of this.#allConnectedClients.values()) {
            // Викликаємо internal close на сокеті, щоб не запускати handleClientClose знову
            client.ws.close(1001, 'Server is shutting down')
        }
        this.#allConnectedClients.clear()

        // Знищуємо всі Namespace
        for (const ns of this.#namespaces.values()) {
            ns.destroy()
        }
        this.#namespaces.clear()

        // Закриваємо WebSocketServer
        await new Promise((resolve) => {
            this.#wss.close(() => {
                this.#logger.info(`[App:${this.#instanceId}] WebSocketServer gracefully closed.`)
                resolve()
            })
        })
        this.#logger.info(`[App:${this.#instanceId}] WebSocketApplication shutdown complete.`)
    }
}

export default WebSocketApplication
