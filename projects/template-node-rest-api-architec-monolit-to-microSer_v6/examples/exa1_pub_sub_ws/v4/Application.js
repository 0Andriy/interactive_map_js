// application.js

import { WebSocketServer } from 'ws' // Для створення WebSocket сервера
import ConnectedClient from './Client.js' // Наш клас ConnectedClient
import Namespace from './Namespace.js' // Наш клас Namespace
import { setupHeartbeat } from './heartbeat.js' // Імпортуємо функцію Heartbeat
// Припускаємо, що у вас є файл logger.js з функцією створення логера
import { createLogger } from './logger.js'

/**
 * Клас, що є основним додатком WebSocket сервера.
 * Керує WebSocket-з'єднаннями, маршрутизацією до Namespace та загальним життєвим циклом.
 */
class WebSocketApplication {
    /**
     * @private
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
    #defaultNamespaceConfigs

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
    } = {}) {
        this.#logger = logger
        this.#allConnectedClients = new Map()
        this.#namespaces = new Map()
        this.#defaultNamespaceConfigs = namespaceConfigs

        // Встановлюємо опцію noServer в true, якщо надано існуючий сервер
        if (server) {
            serverOptions.noServer = true
            this.#logger.info('WebSocketApplication will attach to an existing HTTP server.')
        } else if (!serverOptions.noServer && !port) {
            // Якщо немає existing server і noServer не true, порт обов'язковий
            throw new Error(
                'Port must be provided if not attaching to an existing server or using noServer: true.',
            )
        }

        this.#wss = new WebSocketServer({ port, server, ...serverOptions })

        this.#logger.info(`WebSocketApplication initializing...`)

        // Ініціалізуємо дефолтні Namespace з конфігурації
        this.#defaultNamespaceConfigs.forEach((config, name) => {
            this.#createNamespace(name, config)
        })

        // Якщо дефолтний Namespace не був доданий через конфігурацію, додаємо його
        if (!this.#namespaces.has(defaultNamespaceName)) {
            this.#createNamespace(defaultNamespaceName, {}) // Створюємо дефолтний, якщо його немає
        }

        this.#setupEventHandlers()

        // Передаємо інстанс WebSocketServer, опції Heartbeat та наш логер
        setupHeartbeat(this.#wss, heartbeatOptions, this.#logger)

        const addressInfo = this.#wss.address()
        if (addressInfo && typeof addressInfo === 'object' && 'port' in addressInfo) {
            this.#logger.info(`WebSocketApplication ready. Listening on port ${addressInfo.port}.`)
        } else {
            this.#logger.info(`WebSocketApplication ready. Attached to existing server.`)
        }
    }

    /**
     * Повертає екземпляр WebSocketServer.
     * @returns {WebSocketServer}
     */
    get wss() {
        return this.#wss
    }

    /**
     * Повертає кількість всіх підключених клієнтів.
     * @returns {number}
     */
    get totalClients() {
        return this.#allConnectedClients.size
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
            this.#logger.warn(`Namespace '${name}' already exists. Skipping creation.`)
            return this.#namespaces.get(name)
        }

        this.#logger.info(`Creating Namespace: '${name}' with config:`, config)
        const newNamespace = new Namespace(name, this.#logger, {
            ...config,
            // onRoomRemoved callback - цей Namespace Manager сам себе викликає для видалення кімнати
            onRoomRemoved: (roomName, namespaceName) => {
                const ns = this.#namespaces.get(namespaceName)
                if (ns) {
                    this.#logger.debug(
                        `[Application] Room '${roomName}' in Namespace '${namespaceName}' requested removal.`,
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
            this.#wss.on('listening', () => this.#logger.info('WebSocketServer started listening.'))
        }
        this.#wss.on('close', () => this.#logger.info('WebSocketServer closed.'))
    }

    /**
     * Обробляє нове WebSocket-з'єднання.
     * @private
     * @param {WebSocket} ws - WebSocket-з'єднання.
     * @param {IncomingMessage} req - HTTP-запит, який ініціював з'єднання.
     */
    #handleConnection(ws, req) {
        const requestedPath = req.url ? req.url.split('?')[0] : '/' // Отримуємо шлях без query params
        const namespaceName = this.#extractNamespaceNameFromPath(requestedPath)

        this.#logger.info(
            `New client connected. Path: '${requestedPath}', Proposed Namespace: '${namespaceName}'`,
        )

        let namespace = this.#namespaces.get(namespaceName)
        if (!namespace) {
            // Якщо Namespace не існує і він не був попередньо налаштований як дефолтний
            this.#logger.warn(
                `Namespace '${namespaceName}' not found for path '${requestedPath}'. Using default namespace.`,
            )
            namespace = this.#namespaces.get(
                this.#defaultNamespaceConfigs.keys().next().value || 'default',
            ) // Приймаємо перший або 'default'
            if (!namespace) {
                this.#logger.error(`Default namespace not found! This should not happen.`)
                ws.close(1011, 'Server error: Default namespace not available.')
                return
            }
        }

        const client = new ConnectedClient(ws, this.#logger)
        this.#allConnectedClients.set(client.connectionId, client)
        namespace.addClient(client) // Додаємо клієнта до відповідного Namespace

        // Зберігаємо посилання на Namespace безпосередньо в об'єкті ws,
        // щоб його можна було отримати з ConnectedClient у обробниках повідомлень.
        // Це спрощує приклад, але в складніших архітектурах краще передавати Namespace в контексті подій.
        client.ws.namespace = namespace

        this.#logger.info(
            `Client ${client.connectionId} assigned to Namespace: '${namespace.name}'. Total clients: ${this.totalClients}`,
        )

        // Встановлюємо обробники подій для конкретного клієнта
        ws.on('message', (message) => this.#handleClientMessage(client, message, namespaceName))
        ws.on('close', (code, reason) =>
            this.#handleClientClose(client, code, reason, namespaceName),
        )
        ws.on('error', (error) => this.#handleClientError(client, error, namespaceName))
    }

    /**
     * Витягує ім'я Namespace з URL шляху.
     * Наприклад, "/chat/room1" -> "chat"
     * "/game" -> "game"
     * "/" -> "default" (або ім'я дефолтного Namespace)
     * @private
     * @param {string} path - Шлях URL запиту.
     * @returns {string} - Ім'я Namespace.
     */
    #extractNamespaceNameFromPath(path) {
        if (path === '/' || path === '') {
            return this.#defaultNamespaceConfigs.keys().next().value || 'default' // Дефолтний Namespace
        }
        // Шлях зазвичай починається з '/', тому перший елемент буде порожнім
        const parts = path.split('/').filter((p) => p !== '')
        return parts.length > 0
            ? parts[0]
            : this.#defaultNamespaceConfigs.keys().next().value || 'default'
    }

    /**
     * Обробляє вхідні повідомлення від клієнта.
     * @private
     * @param {ConnectedClient} client - Клієнт, від якого надійшло повідомлення.
     * @param {string | Buffer} message - Повідомлення.
     */
    #handleClientMessage(client, message, namespaceName) {
        this.#logger.debug(
            `[Client:${client.connectionId}] Received message: ${message.toString()}`,
        )

        // Парсимо повідомлення (припускаємо JSON для структурування)
        let parsedMessage
        try {
            parsedMessage = JSON.parse(message.toString())
        } catch (e) {
            this.#logger.warn(
                `[Client:${
                    client.connectionId
                }] Failed to parse message as JSON: ${message.toString()}`,
                { error: e.message },
            )
            client.send({ type: 'ERROR', payload: 'Invalid JSON message.' })
            return
        }

        // Знаходимо Namespace, до якого приєднаний цей клієнт
        // Ми вже зберегли посилання на namespace в client.ws.namespace під час підключення.
        const targetNamespace = namespaceName

        if (!targetNamespace) {
            this.#logger.error(
                `[Client:${client.connectionId}] No associated namespace found for incoming message. Disconnecting client.`,
            )
            client.ws.close(1011, 'No associated namespace')
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
                `[Client:${client.connectionId}] Error handling event in Namespace '${targetNamespace.name}': ${error.message}`,
                { error: error.message, stack: error.stack },
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
    #handleClientClose(client, code, reason, namespaceName) {
        this.#logger.info(
            `[Client:${
                client.connectionId
            }] Disconnected. Code: ${code}, Reason: ${reason.toString()}`,
        )

        // Видаляємо клієнта з усіх Namespace та Rooms, до яких він належав
        // Оскільки ми більше не покладаємося на client.ws.namespace,
        // потрібно пройтися по всіх namespace і перевірити, де був клієнт.
        // Це може бути менш ефективно, якщо клієнтів і namespace дуже багато,
        // але є більш надійним, якщо client.ws.namespace не використовується.
        for (const ns of this.#namespaces.values()) {
            if (ns.hasClient(client.connectionId)) {
                ns.removeClient(client.connectionId)
            }
        }

        // Видаляємо клієнта з усіх Namespace та Rooms, до яких він належав
        // З client.ws.namespace ми знаємо основний namespace клієнта при відключенні
        const primaryNamespace = client.ws.namespace
        if (primaryNamespace) {
            primaryNamespace.removeClient(client.connectionId)
            // Додатково, клієнт може бути в кімнатах, які не належать "первинному" namespace.
            // ConnectedClient відстежує всі кімнати, в яких він знаходиться, тому
            // пройдемося по них, щоб переконатися, що він видалений з усіх кімнат.
            // Зауважте: room.removeClient вже видаляє клієнта з внутрішнього списку клієнта.
            // Тут ми просто викликаємо його, щоб кімната оновила свій стан (зменшила size, запустила очищення)
            client.rooms.forEach((roomFullName) => {
                const [namespaceName, roomName] = roomFullName.split('/')
                const ns = this.#namespaces.get(namespaceName)
                if (ns) {
                    const room = ns.getRoom(roomName)
                    if (room) {
                        // Перевіряємо, чи клієнт дійсно ще в цій кімнаті,
                        // хоча ConnectedClient.leaveRoom вже мав би його видалити.
                        if (room.hasClient(client.connectionId)) {
                            room.removeClient(client.connectionId)
                        }
                    }
                }
            })
        }

        this.#allConnectedClients.delete(client.connectionId)
        this.#logger.info(
            `Client ${client.connectionId} removed. Total clients: ${this.totalClients}`,
        )
    }

    /**
     * Обробляє помилки, пов'язані з клієнтським з'єднанням.
     * @private
     * @param {ConnectedClient} client - Клієнт, на якому сталася помилка.
     * @param {Error} error - Об'єкт помилки.
     */
    #handleClientError(client, error, namespaceName) {
        this.#logger.error(`[Client:${client.connectionId}] Error: ${error.message}`, {
            error: error.message,
            stack: error.stack,
        })
        // Можливо, закриваємо з'єднання, якщо помилка критична
        client.ws.close(1011, 'Internal Server Error')
    }

    /**
     * Обробляє помилки на рівні сервера WebSocket.
     * @private
     * @param {Error} error - Об'єкт помилки.
     */
    #handleServerError(error) {
        this.#logger.error(`WebSocketServer error: ${error.message}`, {
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
            `Broadcasting message to ${this.totalClients} clients (excluding ${excludeConnectionIds.length}).`,
            {
                message: message,
                exclude: excludeConnectionIds,
            },
        )
        let sentCount = 0
        for (const client of this.#allConnectedClients.values()) {
            if (!excludeConnectionIds.includes(client.connectionId)) {
                client.send(message, options)
                sentCount++
            }
        }
        this.#logger.debug(`Broadcast message sent to ${sentCount} clients globally.`)
    }

    /**
     * Зупиняє WebSocket сервер та очищає всі ресурси.
     */
    async stop() {
        this.#logger.info('Shutting down WebSocketApplication...')
        // Закриваємо всі клієнтські з'єднання
        for (const client of this.#allConnectedClients.values()) {
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
                this.#logger.info('WebSocketServer gracefully closed.')
                resolve()
            })
        })
        this.#logger.info('WebSocketApplication shutdown complete.')
    }
}

export default WebSocketApplication
