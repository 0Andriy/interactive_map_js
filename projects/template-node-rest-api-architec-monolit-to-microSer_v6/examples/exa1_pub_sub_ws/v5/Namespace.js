// Namespace.js

import { TaskScheduler } from './TaskScheduler.js'
import Room from './Room.js' // Імпортуємо клас Room
import ConnectedClient from './Client.js' // Для типізації, якщо потрібно

/**
 * Клас, що представляє простір імен (Namespace) для групування кімнат
 * та керування загальними операціями в межах цього простору імен.
 */
class Namespace {
    /**
     * @private
     * Ім'я простору імен.
     * @type {string}
     */
    #name

    /**
     * @private
     * Об'єкт логера.
     * @type {object}
     */
    #logger

    /**
     * @private
     * Планувальник задач для цього конкретного простору імен.
     * @type {TaskScheduler}
     */
    #taskScheduler

    /**
     * @private
     * Префікс, який додається до всіх taskId, що планується цим Namespace.
     * @type {string}
     */
    #namespaceTaskPrefix

    /**
     * @private
     * Мапа кімнат, що належать цьому простору імен.
     * Key: roomName (string), Value: Room (Room instance)
     * @type {Map<string, Room>}
     */
    #rooms

    /**
     * @private
     * Зберігає всі connectionId клієнтів, які приєднані до цього namespace.
     * Це швидкий спосіб дізнатися, хто підключений до всього namespace.
     * Key: connectionId (string), Value: ConnectedClient
     * @type {Map<string, ConnectedClient>}
     */
    #connectedClients

    /**
     * @private
     * Дефолтна функція-обробник для подій, що стосуються цього Namespace.
     * Приймає { type: string, payload: any, client: ConnectedClient }
     * @type {function(object): any}
     */
    #defaultHandler

    /**
     * @private
     * Кастомна функція-обробник для подій, що стосуються цього Namespace.
     * Приймає { type: string, payload: any, client: ConnectedClient }
     * @type {function(object): any | null}
     */
    #customHandler

    /**
     * @private
     * Колбек, що викликається, коли кімната має бути видалена з namespace.
     * @type {function(string, string): void}
     */
    #onRoomRemovedFromNamespaceCallback

    /**
     * @param {string} name - Унікальне ім'я простору імен (наприклад, 'chat', 'game').
     * @param {object} logger - Об'єкт логера.
     * @param {object} [options={}] - Додаткові опції для Namespace.
     * @param {LeaderElection | null} [options.leaderElection=null] - Екземпляр LeaderElection для TaskScheduler.
     * @param {function(object): any} [options.defaultHandler=() => {}] - Дефолтний обробник подій для Namespace.
     * @param {function(object): any | null} [options.customHandler=null] - Кастомний обробник подій для Namespace.
     * @param {function(string, string): void} onRoomRemoved - Колбек, що викликається, коли кімната має бути видалена з namespace (наприклад, для RoomManager).
     */
    constructor(
        name,
        logger,
        {
            leaderElection = null,
            defaultHandler = (context) => {
                logger.debug(
                    `[Namespace:${name}] Default handler executed for type: ${context.type}`,
                )
            },
            customHandler = null,
            onRoomRemoved = async () => null, // Обов'язковий колбек, який викликається з Room
        } = {},
    ) {
        if (!name || typeof name !== 'string' || name.trim() === '') {
            throw new Error('Namespace name is required and must be a non-empty string.')
        }
        // Валідація логера, аналогічно Room
        if (!logger) {
            throw new Error(
                'Invalid logger object provided to Namespace constructor. It must have info, warn, error, debug methods.',
            )
        }
        if (typeof onRoomRemoved !== 'function') {
            throw new Error('onRoomRemoved callback function is required for Namespace.')
        }
        if (typeof defaultHandler !== 'function') {
            throw new Error('defaultHandler must be a function.')
        }
        if (customHandler !== null && typeof customHandler !== 'function') {
            throw new Error('customHandler must be a function or null.')
        }

        this.#name = name
        this.#logger = logger
        this.#taskScheduler = new TaskScheduler(logger, leaderElection)
        // Встановлюємо префікс для задач цього Namespace
        this.#namespaceTaskPrefix = `namespace-${this.#name}`
        this.#rooms = new Map()
        this.#connectedClients = new Map()
        this.#defaultHandler = defaultHandler
        this.#customHandler = customHandler
        this.#onRoomRemovedFromNamespaceCallback = onRoomRemoved

        this.#logger.info(`[Namespace:${this.#name}] Namespace created.`, { namespace: this.#name })
    }

    /**
     * Повертає ім'я простору імен.
     * @returns {string}
     */
    get name() {
        return this.#name
    }

    /**
     * Повертає кількість активних клієнтів у цьому Namespace.
     * @returns {number}
     */
    get size() {
        return this.#connectedClients.size
    }

    /**
     * Повертає колекцію всіх кімнат у цьому Namespace.
     * @returns {IterableIterator<Room>}
     */
    get rooms() {
        return this.#rooms.values()
    }

    /**
     * Повертає колекцію всіх підключених клієнтів у цьому Namespace.
     * @returns {IterableIterator<Client>}
     */
    get clients() {
        return this.#connectedClients
    }

    /**
     * Додає клієнта до цього Namespace.
     * @param {ConnectedClient} client - Екземпляр ConnectedClient.
     * @throws {Error} Якщо надано недійсний тип клієнта.
     */
    addClient(client) {
        // Валідація ConnectedClient, аналогічно Room
        if (!(client instanceof ConnectedClient)) {
            this.#logger.error(
                `[Namespace:${this.#name}] Attempted to add an invalid client type.`,
                {
                    namespace: this.#name,
                    invalidClient: client,
                },
            )
            throw new Error('Only instances of ConnectedClient can be added to a Namespace.')
        }

        if (this.#connectedClients.has(client.connectionId)) {
            this.#logger.warn(
                `[Namespace:${this.#name}] Client ${
                    client.connectionId
                } already registered in this namespace.`,
                {
                    connectionId: client.connectionId,
                    userId: client.userId,
                    namespace: this.#name,
                },
            )
            return
        }
        this.#connectedClients.set(client.connectionId, client)
        this.#logger.info(
            `[Namespace:${this.#name}] Client ${
                client.connectionId
            } connected to namespace. Total clients: ${this.size}`,
            {
                connectionId: client.connectionId,
                userId: client.userId,
                namespace: this.#name,
                totalClients: this.size,
            },
        )
    }

    /**
     * Видаляє клієнта з цього Namespace.
     * Цей метод відповідає за видалення клієнта з внутрішнього реєстру Namespace
     * та з усіх кімнат, що належать цьому Namespace.
     * @param {string} connectionId - ID з'єднання клієнта.
     * @returns {boolean} - True, якщо клієнта було видалено, false, якщо не знайдено.
     */
    removeClient(connectionId) {
        const client = this.#connectedClients.get(connectionId)
        if (client) {
            this.#connectedClients.delete(connectionId)

            const prefixFullNameRoom = `namespace:${this.#name}:room:`

            // Важливо: клієнт має залишити всі кімнати, в яких він перебуває в цьому namespace.
            // Ми ітеруємо по *копії* списку кімнат клієнта, щоб уникнути проблем під час модифікації
            // оригінального списку під час ітерації.
            const clientRoomsInNamespace = Array.from(client.rooms).filter((roomFullName) =>
                roomFullName.startsWith(prefixFullNameRoom),
            )

            for (const roomFullName of clientRoomsInNamespace) {
                // Витягуємо лише ім'я кімнати, щоб знайти її в Map #rooms
                // fullName: "namespace:my_ns:room:my_room"
                // roomName: "my_room"
                const roomName = roomFullName.substring(prefixFullNameRoom.length)

                const room = this.#rooms.get(roomName)
                if (room && room.hasClient(connectionId)) {
                    room.removeClient(connectionId) // Делегуємо видалення з кімнати
                    this.#logger.debug(
                        `[Namespace:${
                            this.#name
                        }] Client ${connectionId} also removed from room '${roomName}'.`,
                        {
                            connectionId: connectionId,
                            userId: client.userId,
                            namespace: this.#name,
                            roomName: roomName,
                        },
                    )
                }
            }

            this.#logger.info(
                `[Namespace:${
                    this.#name
                }] Client ${connectionId} disconnected from namespace. Total clients: ${this.size}`,
                {
                    connectionId: connectionId,
                    userId: client.userId,
                    namespace: this.#name,
                    totalClients: this.size,
                },
            )
            return true
        }
        this.#logger.debug(
            `[Namespace:${
                this.#name
            }] Client ${connectionId} not found in this namespace to remove.`,
            {
                connectionId: connectionId,
                namespace: this.#name,
            },
        )
        return false
    }

    /**
     * Отримує кімнату за її іменем. Якщо кімната не існує, опціонально створює її.
     * @param {string} roomName - Ім'я кімнати (без префікса namespace).
     * @param {object} [roomOptions={}] - Опції для створення кімнати, якщо вона не існує.
     * @returns {Room} - Екземпляр кімнати.
     * @throws {Error} Якщо roomName недійсний.
     */
    getOrCreateRoom(roomName, roomOptions = {}) {
        if (!roomName || typeof roomName !== 'string' || roomName.trim() === '') {
            throw new Error('Room name is required and must be a non-empty string.')
        }

        let room = this.#rooms.get(roomName)
        if (!room) {
            this.#logger.info(`[Namespace:${this.#name}] Creating new room: ${roomName}`, {
                namespace: this.#name,
                roomName: roomName,
            })
            // Передача колбеку для Room.onRoomEmptyAndExpired
            room = new Room(roomName, this.#name, this.#logger, {
                ...roomOptions,
                onRoomEmptyAndExpired: (name, namespace) => {
                    // Цей колбек викликається з екземпляра Room
                    this.#handleRoomEmptyAndExpired(name, namespace)
                },
                // Важливо: leaderElection передається в TaskScheduler Namespace,
                // а не Room. Room створює свій TaskScheduler, але без власного leaderElection,
                // якщо ми не хочемо, щоб кожна кімната мала окремого лідера.
                // Якщо потрібно, щоб TaskScheduler кожної кімнати міг брати участь у виборах лідера,
                // то 'leaderElection' має бути переданий також в конструктор Room.
                // Наразі TaskScheduler кімнати працює незалежно.
            })
            this.#rooms.set(roomName, room)
        }
        return room
    }

    /**
     * Отримує існуючу кімнату за її іменем.
     * @param {string} roomName - Ім'я кімнати (без префікса namespace).
     * @returns {Room | undefined} - Екземпляр кімнати або undefined, якщо не знайдено.
     */
    getRoom(roomName) {
        return this.#rooms.get(roomName)
    }

    /**
     * Видаляє кімнату з цього Namespace.
     * @param {string} roomName - Ім'я кімнати для видалення.
     * @returns {boolean} - True, якщо кімнату було видалено, false, якщо не знайдено.
     */
    deleteRoom(roomName) {
        const room = this.#rooms.get(roomName)
        if (room) {
            room.destroy() // Очищаємо всі ресурси кімнати перед видаленням
            this.#rooms.delete(roomName)
            this.#logger.info(
                `[Namespace:${this.#name}] Room '${roomName}' removed from namespace.`,
                {
                    namespace: this.#name,
                    roomName: roomName,
                },
            )
            return true
        }
        this.#logger.warn(
            `[Namespace:${this.#name}] Attempted to delete non-existent room: ${roomName}`,
            {
                namespace: this.#name,
                roomName: roomName,
            },
        )
        return false
    }

    /**
     * Обробник для колбеку onRoomEmptyAndExpired з класу Room.
     * Цей приватний метод викликається, коли Room сигналізує, що її потрібно видалити.
     * @private
     * @param {string} roomName - Ім'я кімнати, яка стала порожньою та вичерпала термін життя.
     * @param {string} roomNamespace - Простір імен кімнати (повинен співпадати з поточним).
     */
    #handleRoomEmptyAndExpired(roomName, roomNamespace) {
        if (roomNamespace !== this.#name) {
            this.#logger.error(
                `[Namespace:${
                    this.#name
                }] Received cleanup request for room '${roomName}' from wrong namespace '${roomNamespace}'. Skipping.`,
                {
                    namespace: this.#name,
                    roomName: roomName,
                    roomNamespace: roomNamespace,
                },
            )
            return
        }
        this.#logger.info(
            `[Namespace:${
                this.#name
            }] Room '${roomName}' reported as empty and expired. Initiating deletion from namespace.`,
            {
                roomName: roomName,
                namespace: roomNamespace,
            },
        )
        // Викликаємо публічний метод deleteRoom для повного видалення кімнати
        const wasDeleted = this.deleteRoom(roomName)

        // Сповіщаємо зовнішній компонент (наприклад, RoomManager) про видалення кімнати.
        // Це робиться *після* того, як кімната вже видалена з внутрішньої мапи namespace.
        if (wasDeleted && this.#onRoomRemovedFromNamespaceCallback) {
            this.#onRoomRemovedFromNamespaceCallback(roomName, roomNamespace)
        }
    }

    /**
     * Надсилає повідомлення всім клієнтам, підключеним до цього Namespace.
     * @param {string | object} message - Повідомлення для надсилання.
     * @param {string[]} [excludeConnectionIds=[]] - Масив connectionId клієнтів, яких слід виключити.
     * @param {object} [options={}] - Додаткові опції для надсилання (передаються в ConnectedClient.send).
     */
    send(message, excludeConnectionIds = [], options = {}) {
        this.#logger.debug(
            `[Namespace:${this.#name}] Attempting to send message to ${
                this.size
            } clients in namespace (excluding ${excludeConnectionIds.length}).`,
            {
                namespace: this.#name,
                message: typeof message === 'object' ? JSON.stringify(message) : message,
                exclude: excludeConnectionIds,
            },
        )
        let sentCount = 0
        for (const client of this.#connectedClients.values()) {
            if (!excludeConnectionIds.includes(client.connectionId)) {
                try {
                    client.send(message, options)
                    sentCount++
                } catch (e) {
                    this.#logger.error(
                        `[Namespace:${this.#name}] Error sending message to client ${
                            client.connectionId
                        }: ${e.message}`,
                        {
                            namespace: this.#name,
                            connectionId: client.connectionId,
                            userId: client.userId,
                            error: e.message,
                        },
                    )
                }
            }
        }
        this.#logger.info(
            `[Namespace:${this.#name}] Message sent to ${sentCount} clients in namespace.`,
            {
                namespace: this.#name,
                clientsSentTo: sentCount,
            },
        )
    }

    /**
     * Надсилає повідомлення конкретному користувачу, підключеному до цього Namespace (всім його з'єднанням).
     * @param {string} userId - ID користувача.
     * @param {string | object} message - Повідомлення для надсилання.
     * @param {object} [options={}] - Додаткові опції для надсилання.
     */
    sendToUser(userId, message, options = {}) {
        let sentCount = 0
        for (const client of this.#connectedClients.values()) {
            if (client.userId === userId && client.isAuthenticated) {
                try {
                    client.send(message, options)
                    sentCount++
                } catch (error) {
                    this.#logger.error(
                        `[Namespace:${
                            this.#name
                        }] Error sending message to user ${userId} (connection ${
                            client.connectionId
                        }): ${error.message}`,
                        {
                            namespace: this.#name,
                            userId: userId,
                            connectionId: client.connectionId,
                            error: error.message,
                        },
                    )
                }
            }
        }
        if (sentCount > 0) {
            this.#logger.debug(
                `[Namespace:${
                    this.#name
                }] Sent message to user ${userId} across ${sentCount} connections in namespace.`,
                {
                    namespace: this.#name,
                    userId: userId,
                    message: typeof message === 'object' ? 'Object (logged separately)' : message,
                    connectionsSent: sentCount,
                },
            )
        } else {
            this.#logger.warn(
                `[Namespace:${
                    this.#name
                }] Attempted to send message to user ${userId}, but no active, authenticated connections found in this namespace.`,
                {
                    namespace: this.#name,
                    userId: userId,
                },
            )
        }
    }

    /**
     * Обробляє вхідну подію, застосовуючи дефолтний та кастомний обробники.
     * Це є точкою входу для обробки повідомлень або подій, що стосуються цього Namespace.
     * @param {object} context - Контекст події, наприклад: { type: string, payload: any, client: ConnectedClient }.
     * @returns {any} - Результат обробки (може бути результатом кастомного обробника).
     */
    handleEvent(context) {
        this.#logger.debug(
            `[Namespace:${this.#name}] Handling event of type '${context.type}' for client ${
                context.client.connectionId
            }.`,
            {
                namespace: this.#name,
                eventType: context.type,
                connectionId: context.client.connectionId,
            },
        )

        // 1. Дефолтна поведінка
        let defaultResult = null
        try {
            defaultResult = this.#defaultHandler(context)
        } catch (error) {
            this.#logger.error(
                `[Namespace:${this.#name}] Error in default handler for event type '${
                    context.type
                }': ${error.message}`,
                {
                    namespace: this.#name,
                    eventType: context.type,
                    error: error.message,
                },
            )
            // Можна обробити помилку або re-throw
            throw error
        }

        // 2. Кастомна поведінка
        if (this.#customHandler) {
            try {
                // Кастомний обробник може отримати результат дефолтного обробника,
                // а також весь контекст.
                // Він може повністю змінити поведінку або доповнити її.
                return this.#customHandler({ ...context, defaultHandlerResult: defaultResult })
            } catch (error) {
                this.#logger.error(
                    `[Namespace:${this.#name}] Error in custom handler for event type '${
                        context.type
                    }': ${error.message}`,
                    {
                        namespace: this.#name,
                        eventType: context.type,
                        error: error.message,
                    },
                )
                throw error
            }
        }
        return defaultResult // Якщо кастомного обробника немає, повертаємо результат дефолтного
    }

    /**
     * Приватний допоміжний метод для формування повного taskId з префіксом Namespace.
     * @private
     * @param {string} baseTaskId - Базовий ідентифікатор задачі (без префікса Namespace).
     * @returns {string} Повний ідентифікатор задачі.
     */
    #getFullTaskId(baseTaskId) {
        return `${this.#namespaceTaskPrefix}-${baseTaskId}`
    }

    /**
     * Перевіряє, чи запущенна задача з даним taskId в цьому Namespace.
     * @param {string} taskId - Унікальний ідентифікатор задачі (БЕЗ префікса Namespace).
     * @returns {boolean}
     */
    hasTask(taskId) {
        return this.#taskScheduler.hasTask(this.#getFullTaskId(taskId))
    }

    /**
     * Планує періодичну задачу для цього Namespace.
     * Перевіряє наявність задачі, щоб уникнути дублювання.
     * @param {string} taskId - Унікальний ідентифікатор задачі (БЕЗ префікса Namespace).
     * @param {function(object): any} executeFn - Функція, яка буде виконуватися.
     * @param {import('./TaskScheduler').TaskConfig} [config={}] - Об'єкт конфігурації задачі.
     * @param {object} [params={}] - Параметри, які будуть передані в executeFn.
     * @returns {boolean} - True, якщо задача була успішно запланована, false, якщо задача з таким ID вже існує.
     */
    scheduleTask(taskId, executeFn, config = {}, params = {}) {
        if (!taskId || typeof taskId !== 'string' || taskId.trim() === '') {
            throw new Error('Task ID is required and must be a non-empty string.')
        }

        const fullTaskId = this.#getFullTaskId(taskId)

        if (this.hasTask(taskId)) {
            // Викликаємо hasTask з базовим taskId
            this.#logger.warn(
                `[Namespace:${
                    this.#name
                }] Task with ID '${fullTaskId}' (raw: ${taskId}) is already scheduled in this namespace. Skipping new scheduling.`,
                {
                    namespace: this.#name,
                    fullTaskId: fullTaskId,
                    rawTaskId: taskId,
                },
            )
            return false
        }
        this.#taskScheduler.scheduleTask(fullTaskId, executeFn, config, params)
        this.#logger.info(
            `[Namespace:${this.#name}] Task '${fullTaskId}' (raw: ${taskId}) scheduled.`,
            {
                namespace: this.#name,
                fullTaskId: fullTaskId,
                rawTaskId: taskId,
            },
        )
        return true
    }

    /**
     * Зупиняє заплановану задачу в цьому Namespace.
     * @param {string} taskId - Ідентифікатор задачі (БЕЗ префікса Namespace).
     */
    stopTask(taskId) {
        if (!taskId || typeof taskId !== 'string' || taskId.trim() === '') {
            this.#logger.warn(
                `[Namespace:${this.#name}] Attempted to stop task with invalid ID: '${taskId}'.`,
                {
                    namespace: this.#name,
                    taskId: taskId,
                },
            )
            return
        }
        const fullTaskId = this.#getFullTaskId(taskId)
        this.#taskScheduler.stopTask(fullTaskId)
        this.#logger.info(
            `[Namespace:${this.#name}] Task '${fullTaskId}' (raw: ${taskId}) stopped.`,
            {
                namespace: this.#name,
                fullTaskId: fullTaskId,
                rawTaskId: taskId,
            },
        )
    }

    /**
     * Очищає всі ресурси Namespace.
     * Зупиняє всі задачі та знищує всі кімнати.
     */
    destroy() {
        this.#taskScheduler.stopAllTasks()
        this.#connectedClients.clear() // Всі клієнти вже мають бути відключені на вищому рівні

        // Знищуємо всі кімнати в цьому namespace
        // Використовуємо Array.from для створення копії Map.values(),
        // щоб уникнути проблем під час видалення елементів з мапи під час ітерації.
        for (const room of Array.from(this.#rooms.values())) {
            try {
                room.destroy() // Знищуємо кожну кімнату
            } catch (error) {
                this.#logger.error(
                    `[Namespace:${this.#name}] Error destroying room '${room.name}': ${
                        error.message
                    }`,
                    {
                        namespace: this.#name,
                        roomName: room.name,
                        error: error.message,
                    },
                )
            }
        }
        this.#rooms.clear() // Очищаємо мапу кімнат
        this.#logger.info(
            `[Namespace:${this.#name}] Namespace destroyed. All tasks stopped and rooms cleared.`,
            {
                namespace: this.#name,
            },
        )
    }
}

export default Namespace
