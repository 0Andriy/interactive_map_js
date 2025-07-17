// namespace.js

import { TaskScheduler } from './TaskScheduler.js'
import Room from './Room.js' // Імпортуємо клас Room
import ConnectedClient from './Client.js' // Для типізації

/**
 * Клас, що представляє простір імен (Namespace) для групування кімнат
 * та керування загальними операціями в межах цього простору імен.
 */
class Namespace {
    /**
     * @private
     * @type {string}
     */
    #name

    /**
     * @private
     * @type {object}
     */
    #logger

    /**
     * @private
     * @type {TaskScheduler}
     */
    #taskScheduler

    /**
     * Мапа кімнат, що належать цьому простору імен.
     * Key: roomName (string), Value: Room (Room instance)
     * @private
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
     * @param {string} name - Унікальне ім'я простору імен (наприклад, 'chat', 'game').
     * @param {object} logger - Об'єкт логера.
     * @param {object} [options={}] - Додаткові опції для Namespace.
     * @param {LeaderElection | null} [options.leaderElection=null] - Екземпляр LeaderElection для TaskScheduler.
     * @param {function(object): any} [options.defaultHandler=() => {}] - Дефолтний обробник подій для Namespace.
     * @param {function(object): any | null} [options.customHandler=null] - Кастомний обробник подій для Namespace.
     * @param {function(string, string): void} onRoomRemoved - Колбек, що викликається, коли кімната має бути видалена з namespace.
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
                // Тут може бути базова логіка, наприклад, відправка ping/pong, обробка загальних помилок
            },
            customHandler = null,
            onRoomRemoved, // Обов'язковий колбек, який викликається з Room
        } = {},
    ) {
        if (!name) {
            throw new Error('Namespace name is required.')
        }
        if (typeof onRoomRemoved !== 'function') {
            throw new Error('onRoomRemoved callback function is required for Namespace.')
        }

        this.#name = name
        this.#logger = logger
        this.#taskScheduler = new TaskScheduler(logger, leaderElection)
        this.#rooms = new Map()
        this.#connectedClients = new Map()
        this.#defaultHandler = defaultHandler
        this.#customHandler = customHandler
        this.onRoomRemoved = onRoomRemoved // Зберігаємо колбек для обробки видалення кімнат

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
     * Додає клієнта до цього Namespace.
     * @param {ConnectedClient} client - Екземпляр ConnectedClient.
     */
    addClient(client) {
        if (this.#connectedClients.has(client.connectionId)) {
            this.#logger.warn(
                `[Namespace:${this.#name}] Client ${
                    client.connectionId
                } already registered in this namespace.`,
                {
                    connectionId: client.connectionId,
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
                namespace: this.#name,
                totalClients: this.size,
            },
        )
    }

    /**
     * Видаляє клієнта з цього Namespace.
     * @param {string} connectionId - ID з'єднання клієнта.
     * @returns {boolean} - True, якщо клієнта було видалено, false, якщо не знайдено.
     */
    removeClient(connectionId) {
        const client = this.#connectedClients.get(connectionId)
        if (client) {
            this.#connectedClients.delete(connectionId)
            // Клієнт також має покинути всі кімнати в цьому namespace
            // (це краще робити на рівні RoomManager/ClientManager, коли клієнт відключається)
            // Але для чистоти, переконаємося, що він покинув кімнати, які знає цей namespace
            client.rooms.forEach((roomFullName) => {
                if (roomFullName.startsWith(`${this.#name}:`)) {
                    // Перевіряємо, чи кімната належить цьому namespace
                    const roomName = roomFullName.substring(this.#name.length + 1)
                    const room = this.#rooms.get(roomName)
                    if (room && room.hasClient(connectionId)) {
                        room.removeClient(connectionId) // Видаляємо з кімнати
                    }
                }
            })

            this.#logger.info(
                `[Namespace:${
                    this.#name
                }] Client ${connectionId} disconnected from namespace. Total clients: ${this.size}`,
                {
                    connectionId: connectionId,
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
     * @param {string} roomName - Ім'я кімнати.
     * @param {object} [roomOptions={}] - Опції для створення кімнати, якщо вона не існує.
     * @returns {Room} - Екземпляр кімнати.
     */
    getOrCreateRoom(roomName, roomOptions = {}) {
        let room = this.#rooms.get(roomName)
        if (!room) {
            this.#logger.info(`[Namespace:${this.#name}] Creating new room: ${roomName}`, {
                namespace: this.#name,
                roomName: roomName,
            })
            room = new Room(roomName, this.#name, this.#logger, {
                ...roomOptions,
                onRoomEmptyAndExpired: (name, namespace) => {
                    this.#handleRoomEmptyAndExpired(name, namespace)
                },
            })
            this.#rooms.set(roomName, room)
        }
        return room
    }

    /**
     * Отримує існуючу кімнату за її іменем.
     * @param {string} roomName - Ім'я кімнати.
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
            room.destroy() // Очищаємо ресурси кімнати перед видаленням
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
     * @private
     * @param {string} roomName - Ім'я кімнати, яка стала порожньою та вичерпала термін життя.
     * @param {string} namespace - Простір імен кімнати (повинен співпадати з поточним).
     */
    #handleRoomEmptyAndExpired(roomName, namespace) {
        if (namespace !== this.#name) {
            this.#logger.error(
                `[Namespace:${
                    this.#name
                }] Received cleanup request for room '${roomName}' from wrong namespace '${namespace}'. Skipping.`,
            )
            return
        }
        this.#logger.info(
            `[Namespace:${
                this.#name
            }] Room '${roomName}' reported as empty and expired. Initiating deletion from namespace.`,
            {
                roomName: roomName,
                namespace: namespace,
            },
        )
        this.deleteRoom(roomName) // Делегуємо видалення кімнати собі ж
        // Тут також можна викликати onRoomRemoved callback, який був переданий в конструктор Namespace
        // щоб повідомити RoomManager (якщо такий буде) про видалення кімнати.
        this.onRoomRemoved(roomName, namespace)
    }

    /**
     * Надсилає повідомлення всім клієнтам, підключеним до цього Namespace.
     * @param {string | object} message - Повідомлення для надсилання.
     * @param {string[]} [excludeConnectionIds=[]] - Масив connectionId клієнтів, яких слід виключити.
     * @param {object} [options={}] - Додаткові опції для надсилання (передаються в ConnectedClient.send).
     */
    send(message, excludeConnectionIds = [], options = {}) {
        this.#logger.debug(
            `[Namespace:${this.#name}] Sending message to ${
                this.size
            } clients in namespace (excluding ${excludeConnectionIds.length}).`,
            {
                namespace: this.#name,
                message: message,
                exclude: excludeConnectionIds,
            },
        )
        let sentCount = 0
        for (const client of this.#connectedClients.values()) {
            if (!excludeConnectionIds.includes(client.connectionId)) {
                client.send(message, options)
                sentCount++
            }
        }
        this.#logger.debug(
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
                client.send(message, options)
                sentCount++
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
                    message: message,
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
     * Перевіряє, чи запущенна задача з даним taskId в цьому Namespace.
     * @param {string} taskId - Унікальний ідентифікатор задачі.
     * @returns {boolean}
     */
    hasTask(taskId) {
        return this.#taskScheduler.hasTask(taskId)
    }

    /**
     * Планує періодичну задачу для цього Namespace.
     * Перевіряє наявність задачі, щоб уникнути дублювання.
     * @param {string} taskId - Унікальний ідентифікатор задачі.
     * @param {function(object): any} executeFn - Функція, яка буде виконуватися.
     * @param {import('./TaskScheduler').TaskConfig} [config={}] - Об'єкт конфігурації задачі.
     * @param {object} [params={}] - Параметри, які будуть передані в executeFn.
     * @returns {boolean} - True, якщо задача була успішно запланована (або оновлена), false, якщо задача з таким ID вже існує.
     */
    scheduleTask(taskId, executeFn, config = {}, params = {}) {
        if (this.hasTask(taskId)) {
            this.#logger.warn(
                `[Namespace:${
                    this.#name
                }] Task with ID '${taskId}' is already scheduled in this namespace. Skipping new scheduling.`,
                {
                    namespace: this.#name,
                    taskId: taskId,
                },
            )
            return false
        }
        this.#taskScheduler.scheduleTask(taskId, executeFn, config, params)
        this.#logger.info(`[Namespace:${this.#name}] Task '${taskId}' scheduled.`, {
            namespace: this.#name,
            taskId: taskId,
        })
        return true
    }

    /**
     * Зупиняє заплановану задачу в цьому Namespace.
     * @param {string} taskId - Ідентифікатор задачі.
     */
    stopTask(taskId) {
        this.#taskScheduler.stopTask(taskId)
        this.#logger.info(`[Namespace:${this.#name}] Task '${taskId}' stopped.`, {
            namespace: this.#name,
            taskId: taskId,
        })
    }

    /**
     * Очищає всі ресурси Namespace.
     * Зупиняє всі задачі та знищує всі кімнати.
     */
    destroy() {
        this.#taskScheduler.stopAllTasks()
        this.#connectedClients.clear()
        // Знищуємо всі кімнати в цьому namespace
        for (const room of this.#rooms.values()) {
            room.destroy() // Знищуємо кожну кімнату
        }
        this.#rooms.clear()
        this.#logger.info(
            `[Namespace:${this.#name}] Namespace destroyed. All tasks stopped and rooms cleared.`,
            {
                namespace: this.#name,
            },
        )
    }
}

export default Namespace
