// src/core/Server.js

import { Namespace } from '../namespace/Namespace.js'
import { Client } from './Client.js'
import { IStateStorage } from '../storage/IStateStorage.js' // Імпортуємо інтерфейс

/**
 * Центральний клас Server, який управляє всіма неймспейсами та підключеними клієнтами
 * за допомогою зовнішнього сховища стану.
 */
class Server {
    /**
     * @param {IStateStorage} storage - Екземпляр сховища стану (In-Memory або Redis).
     * @param {object} [logger=console] - Екземпляр логера. За замовчуванням використовується console.
     */
    constructor(storage, logger = console) {
        if (!(storage instanceof IStateStorage)) {
            // Перевірка, що це реалізація інтерфейсу
            throw new Error('Server constructor requires an instance of IStateStorage.')
        }
        this.logger = logger
        this.storage = storage // <-- Тепер сервер використовує зовнішнє сховище

        // Ці Map тепер керують живими об'єктами (Client, Namespace),
        // які завантажено в пам'ять цього інстансу сервера.
        // Дані про них зберігаються в storage.
        /** @type {Map<string, Namespace>} */
        this.liveNamespaces = new Map() // Map<path, Namespace instance>
        /** @type {Map<string, Client>} */
        this.liveClients = new Map() // Map<clientId, Client instance>

        // Важливо: Асинхронна ініціалізація, тому викликаємо її окремо
        // або в конструкторі, якщо вона не має блокувати main thread.
        // Для конструктора це має бути лише ініціалізація підписок,
        // а логіка створення дефолтних неймспейсів має бути в асинхронній функції.
        this.#subscribeToCrossInstanceMessages()
        this.logger.info('Сервер ініціалізовано. Підписки на Pub/Sub активовано.')
    }

    /**
     * @private
     * Підписується на канали Pub/Sub для обробки повідомлень з інших інстансів.
     */
    #subscribeToCrossInstanceMessages() {
        // Канал для глобальних повідомлень від інших інстансів (server.emit())
        this.storage.subscribe('server:global_message', (channel, payload) => {
            // Обробляємо глобальні повідомлення (наприклад, server.emit())
            if (payload.senderInstanceId === process.env.SERVER_INSTANCE_ID) {
                // this.logger.debug(`[Server Pub/Sub] Ігноруємо власне глобальне повідомлення з каналу '${channel}'.`);
                return // Ігнорувати повідомлення, які були відправлені цим же інстансом
            }
            this.logger.debug(
                `[Server Pub/Sub] Отримано глобальне повідомлення з каналу '${channel}': ${JSON.stringify(
                    payload,
                ).substring(0, 100)}...`,
            )
            // Переслати це всім локально підключеним клієнтам
            this.liveClients.forEach((client) => {
                client.send(payload.messagePayload)
            })
        })

        // Канал для повідомлень конкретному користувачеві (sendToUser)
        this.storage.subscribe('server:user_message', async (channel, payload) => {
            if (payload.senderInstanceId === process.env.SERVER_INSTANCE_ID) {
                // this.logger.debug(`[Server Pub/Sub] Ігноруємо власне повідомлення користувачу з каналу '${channel}'.`);
                return
            }
            this.logger.debug(
                `[Server Pub/Sub] Отримано повідомлення для користувача ${
                    payload.userId
                } з каналу '${channel}': ${JSON.stringify(payload).substring(0, 100)}...`,
            )

            // Знайти всіх локально підключених клієнтів цього користувача
            // (може бути, що getClientsByUserId вже фільтрує по instanceId,
            // але ми перевіряємо liveClient цього інстансу)
            const clientsForUser = await this.storage.getClientsByUserId(payload.userId)
            for (const clientInfo of clientsForUser) {
                const liveClient = this.liveClients.get(clientInfo.id)
                if (liveClient && clientInfo.instanceId === process.env.SERVER_INSTANCE_ID) {
                    liveClient.send(payload.messagePayload)
                }
            }
        })
    }

    /**
     * Ініціалізує сервер, створюючи неймспейс за замовчуванням та інші початкові конфігурації.
     * Цей метод має бути викликаний після конструктора.
     */
    async initialize() {
        await this.#createDefaultNamespace()
        this.logger.info(`Сервер ініціалізовано. Створено неймспейс за замовчуванням "/".`)
    }

    /**
     * @private
     * Створює неймспейс за замовчуванням '/'.
     */
    async #createDefaultNamespace() {
        const defaultPath = '/'
        let nsInfo = await this.storage.getNamespace(defaultPath)
        if (!nsInfo) {
            nsInfo = { path: defaultPath, name: 'Default Namespace' }
            await this.storage.addNamespace(defaultPath, nsInfo)
        }
        // Створюємо "живий" об'єкт Namespace для цього інстансу сервера
        const defaultNamespace = new Namespace(defaultPath, this, this.storage, this.logger)
        this.liveNamespaces.set(defaultPath, defaultNamespace)
        // Ініціалізуємо його (якщо є асинхронна логіка в конструкторі Namespace)
        await defaultNamespace.initialize()
    }

    /**
     * Отримує або створює неймспейс за його шляхом.
     * Аналогічно `io.of()`.
     * @param {string} path - Шлях неймспейсу (наприклад, '/' або '/admin').
     * @returns {Promise<Namespace>} - Об'єкт неймспейсу.
     */
    async of(path) {
        if (!path || typeof path !== 'string') {
            this.logger.error(
                'Шлях неймспейсу повинен бути непорожнім рядком. Використовується шлях за замовчуванням "/".',
            )
            path = '/'
        }
        const normalizedPath = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path

        // Перевірити, чи неймспейс вже завантажено в пам'ять цього інстансу
        if (this.liveNamespaces.has(normalizedPath)) {
            return this.liveNamespaces.get(normalizedPath)
        }

        // Перевірити, чи неймспейс існує в сховищі
        let nsInfo = await this.storage.getNamespace(normalizedPath)
        if (!nsInfo) {
            // Якщо не існує, створити його в сховищі та в пам'яті
            nsInfo = { path: normalizedPath, name: `Неймспейс ${normalizedPath}` }
            await this.storage.addNamespace(normalizedPath, nsInfo)
            this.logger.info(`Новий неймспейс "${normalizedPath}" створено в сховищі.`)
        }

        const newNamespace = new Namespace(normalizedPath, this, this.storage, this.logger)
        this.liveNamespaces.set(normalizedPath, newNamespace)
        // Важливо: ініціалізувати новий неймспейс
        await newNamespace.initialize()
        this.logger.info(`Неймспейс "${normalizedPath}" завантажено/створено.`)
        return newNamespace
    }

    /**
     * Приймає нове клієнтське з'єднання (реальний WebSocket).
     * @param {string} clientId - Унікальний ID з'єднання.
     * @param {string} userId - ID користувача.
     * @param {string} username - Ім'я користувача.
     * @param {import('ws').WebSocket} ws - Фактичний WebSocket сокет.
     * @returns {Promise<Client>} - Створений об'єкт Client.
     */
    async addClientConnection(clientId, userId, username, ws) {
        if (this.liveClients.has(clientId)) {
            this.logger.warn(
                `Клієнтське з'єднання з ID "${clientId}" вже підключено до цього інстансу. Повертаємо існуючого клієнта.`,
            )
            return this.liveClients.get(clientId)
        }

        const client = new Client(clientId, userId, username, ws, this.logger)
        this.liveClients.set(client.id, client) // Додати до живих клієнтів цього інстансу

        // Зберегти інформацію про клієнта в спільному сховищі
        await this.storage.addClient(client.toClientInfo())

        // Автоматично додати клієнта до неймспейсу за замовчуванням '/'
        // Примітка: Логіка приєднання до неймспейсу має бути більш витонченою,
        // але для простоти ми робимо це тут.
        const defaultNamespace = await this.of('/')
        // _addClient тепер додає до liveClientsInNamespace цього неймспейсу
        await defaultNamespace._addClient(client)

        this.logger.info(
            `Клієнтське з'єднання "${client.id}" для Користувача "${client.username}" (ID: ${client.userId}) підключено до Сервера та приєднано до неймспейсу за замовчуванням "/".`,
        )
        return client
    }

    /**
     * Відключає конкретне клієнтське з'єднання від сервера.
     * @param {Client} client - Об'єкт Client для відключення.
     * @returns {Promise<boolean>} - True, якщо з'єднання було відключено.
     */
    async disconnectClient(client) {
        if (!this.liveClients.has(client.id)) {
            this.logger.warn(
                `Спроба відключити невідоме клієнтське з'єднання з ID "${client.id}" від цього інстансу.`,
            )
            return false
        }

        // Закрити фактичне WebSocket з'єднання, якщо воно все ще відкрите
        if (client.ws && client.ws.readyState === client.ws.OPEN) {
            client.ws.close()
            this.logger.debug(
                `Закрито WebSocket для клієнтського з'єднання "${client.id}" (Користувач: ${client.userId}).`,
            )
        }

        // Пройтися по всіх неймспейсах, до яких підключений цей клієнт у сховищі,
        // і попросити їх видалити це з'єднання з їхніх кімнат.
        // Оскільки клієнт може бути в багатьох кімнатах в різних неймспейсах
        // (хоча наша поточна логіка приєднання його виключає з інших кімнат),
        // ми повинні ітеративно пройтися.

        // Цей процес може бути оптимізований в Redis за допомогою AOF та SETS,
        // що дозволить швидко знайти всі кімнати, в яких перебуває клієнт.

        const allNamespacePaths = await this.storage.getAllNamespaces()
        for (const nsPath of allNamespacePaths) {
            const roomsInNs = await this.storage.getRoomsByNamespace(nsPath)
            for (const roomInfo of roomsInNs) {
                const clientsInRoom = await this.storage.getClientsInRoom(nsPath, roomInfo.id)
                if (clientsInRoom.some((c) => c.id === client.id)) {
                    // Якщо клієнт є в цій кімнаті, отримати живий об'єкт кімнати
                    // і попросити його "покинути" (leave)
                    const namespace = this.liveNamespaces.get(nsPath)
                    if (namespace) {
                        const room = await namespace.getRoom(roomInfo.id)
                        if (room) {
                            await room.leave(client) // Room.leave видаляє зі сховища
                        }
                    } else {
                        // Якщо неймспейс не завантажено в цей інстанс,
                        // ми все одно повинні видалити клієнта з кімнати в сховищі
                        await this.storage.removeClientFromRoom(nsPath, roomInfo.id, client.id)
                        this.logger.debug(
                            `Клієнт ${client.id} видалено з кімнати ${roomInfo.id} в неймспейсі ${nsPath} (неймспейс не завантажено в цей інстанс).`,
                        )
                    }
                }
            }
        }

        // Видалити з глобального реєстру з'єднань цього інстансу
        this.liveClients.delete(client.id)

        // Видалити інформацію про клієнта зі спільного сховища
        await this.storage.removeClient(client.id)

        this.logger.info(
            `Клієнтське з'єднання "${client.id}" для Користувача "${client.username}" (ID: ${client.userId}) відключено від Сервера.`,
        )
        return true
    }

    /**
     * Надсилає повідомлення всім з'єднанням на сервері (по всіх неймспейсах).
     * Аналогічно `io.emit()`.
     * @param {string} message - Повідомлення.
     * @param {object} [options={}] - Опції.
     * @returns {Promise<number>} - Кількість з'єднань, яким було надіслано повідомлення (лише локально).
     */
    async emit(message, options = {}) {
        const { type = 'info', metadata = {} } = options
        const messagePayload = {
            message,
            type,
            timestamp: new Date().toISOString(),
            serverGlobal: true,
            ...metadata,
        }

        let sentCount = 0
        // Надсилаємо локально підключеним клієнтам
        this.liveClients.forEach((client) => {
            client.send(messagePayload)
            sentCount++
        })

        // Публікуємо повідомлення для інших інстансів через Pub/Sub
        await this.storage.publish('server:global_message', {
            messagePayload,
            senderInstanceId: process.env.SERVER_INSTANCE_ID, // Додаємо ID інстансу, щоб уникнути циклів
        })

        this.logger.info(
            `Глобальне повідомлення надіслано з Сервера ${sentCount} локальним клієнтським з'єднанням та опубліковано для інших інстансів.`,
        )
        return sentCount // Ця кількість відображає лише локально надіслані, повна кількість буде сумою по всіх інстансах
    }

    /**
     * Надсилає повідомлення конкретному користувачеві (на всі його активні з'єднання).
     * @param {string} userId - ID користувача.
     * @param {string} message - Повідомлення.
     * @param {object} [options={}] - Опції.
     * @returns {Promise<number>} - Кількість з'єднань, яким було надіслано повідомлення (лише локально).
     */
    async sendToUser(userId, message, options = {}) {
        const { type = 'info', metadata = {} } = options
        const messagePayload = {
            message,
            type,
            timestamp: new Date().toISOString(),
            targetUserId: userId,
            ...metadata,
        }

        let sentCount = 0
        // Отримати всі з'єднання цього користувача з будь-якого інстансу
        const userClientInfos = await this.storage.getClientsByUserId(userId)

        for (const clientInfo of userClientInfos) {
            // Якщо клієнт підключений до ЦЬОГО інстансу, надіслати йому безпосередньо
            const liveClient = this.liveClients.get(clientInfo.id)
            if (liveClient) {
                liveClient.send(messagePayload)
                sentCount++
            } else if (
                clientInfo.instanceId &&
                clientInfo.instanceId !== process.env.SERVER_INSTANCE_ID
            ) {
                // Якщо клієнт підключений до ІНШОГО інстансу, опублікувати повідомлення
                await this.storage.publish('server:user_message', {
                    userId: userId,
                    messagePayload: messagePayload,
                    targetClientId: clientInfo.id, // Може бути корисним для фільтрації на віддаленому інстансі
                    targetInstanceId: clientInfo.instanceId,
                    senderInstanceId: process.env.SERVER_INSTANCE_ID,
                })
            } else {
                this.logger.warn(
                    `Клієнт ${clientInfo.id} для користувача ${userId} був у сховищі, але не є живим і не має instanceId для маршрутизації. Пропускаємо.`,
                )
            }
        }

        this.logger.info(
            `Повідомлення Користувачу з ID "${userId}" оброблено. Локально надіслано: ${sentCount}. Опубліковано для інших інстансів.`,
        )
        return sentCount // Знову ж таки, це лише локально надіслані.
    }

    /**
     * Повертає список усіх підключених об'єктів Client, які підключені до ЦЬОГО інстансу.
     * @returns {Array<Client>}
     */
    getAllConnectedClients() {
        return Array.from(this.liveClients.values())
    }

    /**
     * Повертає список усіх унікальних ID користувачів, які мають хоча б одне активне з'єднання
     * на будь-якому інстансі.
     * @returns {Promise<Array<string>>}
     */
    async getAllOnlineUserIds() {
        const allClientInfos = await this.storage.getAllClients()
        const userIds = new Set()
        allClientInfos.forEach((clientInfo) => userIds.add(clientInfo.userId))
        return Array.from(userIds)
    }

    /**
     * Знищує сервер, відключаючи всіх клієнтів і знищуючи всі неймспейси.
     */
    async destroy() {
        this.logger.info(
            'Знищення Сервера. Відключення всіх локальних клієнтів та знищення всіх неймспейсів цього інстансу.',
        )

        // Відключити всіх локально підключених клієнтів
        for (const client of Array.from(this.liveClients.values())) {
            // Викликаємо internal method, щоб уникнути зайвих операцій зі сховищем
            // та дозволити Server.disconnectClient керувати повним видаленням зі сховища.
            if (client.ws && client.ws.readyState === client.ws.OPEN) {
                client.ws.close()
                this.logger.debug(
                    `Закрито WebSocket для клієнтського з'єднання "${client.id}" під час знищення сервера.`,
                )
            }
            this.liveClients.delete(client.id)
            // Важливо: removeClient зі сховища буде викликано пізніше,
            // якщо це не зробило Server.disconnectClient().
            // Тут ми просто очищаємо локальний кеш.
        }

        // Знищити об'єкти неймспейсів цього інстансу
        for (const ns of this.liveNamespaces.values()) {
            await ns.destroy() // Namespace.destroy() тепер теж використовує storage
        }
        this.liveNamespaces.clear()
        this.liveClients.clear()

        // Відключитися від сховища
        await this.storage.disconnect()

        this.logger = null
    }
}

export { Server }
