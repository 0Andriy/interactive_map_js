// Room.js

import { TaskScheduler } from './TaskScheduler.js'
import ConnectedClient from './Client.js'

/**
 * Дефолтний інтервал для перевірки порожніх кімнат, в мілісекундах.
 * Ця задача є "страховкою", основна перевірка відбувається при removeClient.
 * @type {number}
 */
const DEFAULT_EMPTY_ROOM_CHECK_INTERVAL_MS = 5 * 60 * 1000 // 5 хвилин

/**
 * Дефолтний час бездіяльності для видалення порожньої кімнати, в мілісекундах.
 * @type {number}
 */
const DEFAULT_EMPTY_ROOM_LIFETIME_MS = 15 * 60 * 1000 // 15 хвилин

/**
 * Клас, що представляє віртуальну кімнату для групування WebSocket-з'єднань
 * та управління періодичними задачами, пов'язаними з кімнатою.
 */
class Room {
    /**
     * @private
     * Ім'я кімнати.
     * @type {string}
     */
    #name

    /**
     * @private
     * Ім'я Namespace, до якого належить ця кімната.
     * @type {string}
     */
    #namespace

    /**
     * @private
     * Об'єкт логера.
     * @type {object}
     */
    #logger

    /**
     * @private
     * Map для зберігання connectionId клієнтів у цій кімнаті.
     * Key: connectionId (string), Value: ConnectedClient (ConnectedClient instance)
     * @type {Map<string, ConnectedClient>}
     */
    #clients

    /**
     * @private
     * Час останньої активності в кімнаті (додавання/видалення клієнта).
     * @type {Date}
     */
    #lastActivityTime

    /**
     * @private
     * Планувальник задач для цієї конкретної кімнати.
     * @type {TaskScheduler}
     */
    #taskScheduler

    /**
     * @private
     * Префікс, який додається до всіх taskId, що планується цією кімнатою.
     * @type {string}
     */
    #taskPrefix

    /**
     * @private
     * ID задачі для видалення порожньої кімнати.
     * @type {string | null}
     */
    #emptyRoomCleanupTaskId = null

    /**
     * @private
     * Лічильник повідомлень, відправлених з цієї кімнати (за допомогою методів send/sendToUser).
     * @type {number}
     */
    #messagesSentFromRoomCount = 0

    /**
     * @private
     * Чи слід автоматично видаляти кімнату, коли вона стає порожньою та її термін життя вичерпано.
     * @type {boolean}
     */
    #autoCleanupEmptyRoom

    /**
     * @private
     * Інтервал перевірки порожніх кімнат.
     * @type {number}
     */
    #emptyRoomCleanupIntervalMs

    /**
     * @private
     * Час, через який порожня кімната буде видалена.
     * @type {number}
     */
    #emptyRoomLifetimeMs

    /**
     * @private
     * Колбек, що викликається, коли кімната стає порожньою і її термін життя вичерпано.
     * @type {function(string, string): void}
     */
    #onRoomEmptyAndExpired

    /**
     * @param {string} name - Унікальне ім'я кімнати.
     * @param {string} namespace - Простір імен, до якого належить кімната.
     * @param {object} logger - Об'єкт логера з методами info, warn, error, debug.
     * @param {object} [options={}] - Додаткові опції кімнати.
     * @param {number} [options.emptyRoomCleanupIntervalMs=DEFAULT_EMPTY_ROOM_CHECK_INTERVAL_INTERVAL_MS] - Інтервал перевірки порожніх кімнат.
     * @param {number} [options.emptyRoomLifetimeMs=DEFAULT_EMPTY_ROOM_LIFETIME_MS] - Час, через який порожня кімната буде видалена.
     * @param {boolean} [options.autoCleanupEmptyRoom=true] - Чи слід автоматично видаляти кімнату, коли вона стає порожньою. За замовчуванням true.
     * @param {LeaderElection | null} [leaderElection=null] - Екземпляр LeaderElection для TaskScheduler.
     * @param {function(string, string): void} onRoomEmptyAndExpired - Колбек, що викликається, коли кімната стає порожньою і її термін життя вичерпано (тільки якщо autoCleanupEmptyRoom = true).
     */
    constructor(
        name,
        namespace,
        logger,
        {
            emptyRoomCleanupIntervalMs = DEFAULT_EMPTY_ROOM_CHECK_INTERVAL_MS,
            emptyRoomLifetimeMs = DEFAULT_EMPTY_ROOM_LIFETIME_MS,
            autoCleanupEmptyRoom = true,
            leaderElection = null,
            onRoomEmptyAndExpired,
        } = {},
    ) {
        if (!name || !namespace) {
            throw new Error('Room name and namespace are required.')
        }
        if (!logger) {
            throw new Error(
                'Invalid logger object provided to Room constructor. It must have info, warn, error, debug methods.',
            )
        }
        if (autoCleanupEmptyRoom && typeof onRoomEmptyAndExpired !== 'function') {
            throw new Error(
                'onRoomEmptyAndExpired callback function is required when autoCleanupEmptyRoom is true.',
            )
        }

        this.#name = name
        this.#namespace = namespace
        this.#logger = logger
        this.#clients = new Map()
        this.#taskScheduler = new TaskScheduler(logger, leaderElection)
        this.#taskPrefix = `room-${this.fullName}`
        this.#lastActivityTime = new Date()

        // Зберігаємо параметри очищення як приватні поля
        this.#emptyRoomCleanupIntervalMs = emptyRoomCleanupIntervalMs
        this.#emptyRoomLifetimeMs = emptyRoomLifetimeMs
        this.#autoCleanupEmptyRoom = autoCleanupEmptyRoom
        this.#onRoomEmptyAndExpired = onRoomEmptyAndExpired

        if (this.#autoCleanupEmptyRoom) {
            this.#scheduleEmptyRoomCleanup()
        } else {
            this.#logger.info(`[Room:${this.fullName}] Auto cleanup for this room is disabled.`)
        }

        this.#logger.info(`[Room:${this.fullName}] Room created in namespace '${namespace}'.`, {
            roomName: name,
            namespace: namespace,
            autoCleanup: this.#autoCleanupEmptyRoom,
        })
    }

    /**
     * Повертає повне ім'я кімнати (namespace:namespace_name:room:room_name).
     * @returns {string}
     */
    get fullName() {
        return `namespace:${this.#namespace}:room:${this.#name}`
    }

    /**
     * Повертає ім'я кімнати.
     * @returns {string}
     */
    get name() {
        return this.#name
    }

    /**
     * Повертає простір імен кімнати.
     * @returns {string}
     */
    get namespace() {
        return this.#namespace
    }

    /**
     * Повертає поточну кількість клієнтів у кімнаті.
     * @returns {number}
     */
    get size() {
        return this.#clients.size
    }

    /**
     * Повертає кількість повідомлень, відправлених з цієї кімнати.
     * @returns {number}
     */
    get messagesSentFromRoomCount() {
        return this.#messagesSentFromRoomCount
    }

    /**
     * Додає клієнта до кімнати.
     * @param {ConnectedClient} client - Екземпляр ConnectedClient.
     * @throws {Error} Якщо надано недійсний тип клієнта.
     */
    addClient(client) {
        // Валідація ConnectedClient
        if (!(client instanceof ConnectedClient)) {
            this.#logger.error(`[Room:${this.fullName}] Attempted to add an invalid client type.`, {
                room: this.fullName,
                invalidClient: client,
            })
            throw new Error('Only instances of ConnectedClient can be added to a Room.')
        }

        if (this.#clients.has(client.connectionId)) {
            this.#logger.debug(
                `[Room:${this.fullName}] Client ${client.connectionId} is already in this room.`,
                {
                    connectionId: client.connectionId,
                    userId: client.userId,
                    room: this.fullName,
                },
            )
            return
        }

        this.#clients.set(client.connectionId, client)
        client.joinRoom(this.fullName) // Оновлюємо стан клієнта

        this.#updateActivityTime()
        this.#logger.info(
            `[Room:${this.fullName}] Client ${client.connectionId} joined. Total clients: ${this.size}`,
            {
                connectionId: client.connectionId,
                userId: client.userId,
                room: this.fullName,
                totalClients: this.size,
            },
        )
    }

    /**
     * Видаляє клієнта з кімнати.
     * @param {string} connectionId - ID з'єднання клієнта.
     */
    removeClient(connectionId) {
        const client = this.#clients.get(connectionId)
        if (client) {
            this.#clients.delete(connectionId)
            client.leaveRoom(this.fullName) // Оновлюємо стан клієнта

            this.#updateActivityTime()
            this.#logger.info(
                `[Room:${this.fullName}] Client ${connectionId} left. Total clients: ${this.size}`,
                {
                    connectionId: connectionId,
                    userId: client.userId,
                    room: this.fullName,
                    totalClients: this.size,
                },
            )

            if (this.#autoCleanupEmptyRoom && this.size === 0) {
                this.#logger.debug(
                    `[Room:${this.fullName}] Room became empty after client ${connectionId} left. Triggering immediate cleanup check.`,
                    { room: this.fullName },
                )
                this.#checkAndTriggerRoomRemoval() // Негайна перевірка на видалення
            }
        } else {
            this.#logger.debug(
                `[Room:${this.fullName}] Client ${connectionId} not found in this room.`,
                {
                    connectionId: connectionId,
                    room: this.fullName,
                },
            )
        }
    }

    /**
     * Перевіряє, чи містить кімната певного клієнта.
     * @param {string} connectionId - ID з'єднання клієнта.
     * @returns {boolean}
     */
    hasClient(connectionId) {
        return this.#clients.has(connectionId)
    }

    /**
     * Надсилає повідомлення всім клієнтам у кімнаті.
     * Збільшує лічильник відправлених повідомлень.
     * @param {string | object} message - Повідомлення для надсилання.
     * @param {string[]} [excludeConnectionIds=[]] - Масив connectionId клієнтів, яких слід виключити.
     * @param {object} [options={}] - Додаткові опції для надсилання (передаються в ConnectedClient.send).
     */
    send(message, excludeConnectionIds = [], options = {}) {
        let sentToCount = 0
        for (const client of this.#clients.values()) {
            if (!excludeConnectionIds.includes(client.connectionId)) {
                client.send(message, options)
                sentToCount++
            }
        }
        if (sentToCount > 0) {
            this.#messagesSentFromRoomCount++
        }

        this.#logger.debug(
            `[Room:${this.fullName}] Sent message to ${sentToCount} clients (excluding ${
                excludeConnectionIds.length
            }). Total messages from room: ${this.#messagesSentFromRoomCount}`,
            {
                room: this.fullName,
                // Можлива серіалізація повідомлення для логування, якщо логер не робить цього автоматично
                message: typeof message === 'object' ? JSON.stringify(message) : message,
                exclude: excludeConnectionIds,
                clientsSentTo: sentToCount,
                totalMessagesFromRoom: this.#messagesSentFromRoomCount,
            },
        )
    }

    /**
     * Надсилає повідомлення конкретному користувачу в цій кімнаті (всім його з'єднанням, що перебувають тут).
     * Збільшує лічильник відправлених повідомлень.
     * @param {string} userId - ID користувача.
     * @param {string | object} message - Повідомлення для надсилання.
     * @param {object} [options={}] - Додаткові опції для надсилання.
     */
    sendToUser(userId, message, options = {}) {
        let sentToCount = 0
        for (const client of this.#clients.values()) {
            // Перевіряємо client.isAuthenticated для надійності
            if (client.userId === userId && client.isAuthenticated) {
                client.send(message, options)
                sentToCount++
            }
        }
        if (sentToCount > 0) {
            this.#messagesSentFromRoomCount++
            this.#logger.debug(
                `[Room:${
                    this.fullName
                }] Sent message to user ${userId} across ${sentToCount} connections. Total messages from room: ${
                    this.#messagesSentFromRoomCount
                }`,
                {
                    room: this.fullName,
                    userId: userId,
                    message: typeof message === 'object' ? JSON.stringify(message) : message,
                    connectionsSent: sentToCount,
                    totalMessagesFromRoom: this.#messagesSentFromRoomCount,
                },
            )
        } else {
            this.#logger.warn(
                `[Room:${this.fullName}] Attempted to send message to user ${userId}, but no active, authenticated connections found in this room.`,
                {
                    room: this.fullName,
                    userId: userId,
                },
            )
        }
    }

    /**
     * Приватний допоміжний метод для формування повного taskId з префіксом кімнати.
     * @private
     * @param {string} baseTaskId - Базовий ідентифікатор задачі (без префікса кімнати).
     * @returns {string} Повний ідентифікатор задачі.
     */
    #getFullTaskId(baseTaskId) {
        return `${this.#taskPrefix}-${baseTaskId}`
    }

    /**
     * Перевіряє, чи запущенна задача з даним taskId в цій кімнаті.
     * @param {string} taskId - Унікальний ідентифікатор задачі (БЕЗ префікса кімнати).
     * @returns {boolean}
     */
    hasTask(taskId) {
        return this.#taskScheduler.hasTask(this.#getFullTaskId(taskId))
    }

    /**
     * Планує періодичну задачу для цієї кімнати.
     * Цей метод спочатку перевіряє, чи задача з таким ID вже існує.
     * @param {string} taskId - Унікальний ідентифікатор задачі (БЕЗ префікса кімнати).
     * @param {function(object): any} executeFn - Функція, яка буде виконуватися.
     * @param {import('./TaskScheduler').TaskConfig} [config={}] - Об'єкт конфігурації задачі.
     * @param {object} [params={}] - Параметри, які будуть передані в executeFn.
     * @returns {boolean} - True, якщо задача була успішно запланована (або оновлена), false, якщо задача з таким ID вже існує і її не було оновлено.
     */
    scheduleTask(taskId, executeFn, config = {}, params = {}) {
        const fullTaskId = this.#getFullTaskId(taskId)

        if (this.hasTask(taskId)) {
            this.#logger.warn(
                `[Room:${this.fullName}] Task with ID '${fullTaskId}' (raw: ${taskId}) is already scheduled in this room. Skipping new scheduling.`,
                {
                    room: this.fullName,
                    taskId: taskId,
                },
            )
            return false // Повідомляємо, що задачу не було додано
        }

        this.#taskScheduler.scheduleTask(taskId, executeFn, config, params)
        this.#logger.debug(
            `[Room:${this.fullName}] Scheduled task '${fullTaskId}' (raw: ${taskId}).`,
            {
                room: this.fullName,
                fullTaskId: fullTaskId,
                rawTaskId: taskId,
            },
        )
        return true // Повідомляємо, що задача була успішно запланована
    }

    /**
     * Зупиняє заплановану задачу в цій кімнаті.
     * @param {string} taskId - Ідентифікатор задачі.
     */
    stopTask(taskId) {
        const fullTaskId = this.#getFullTaskId(taskId)
        this.#taskScheduler.stopTask(fullTaskId)
        this.#logger.debug(
            `[Room:${this.fullName}] Stopped task '${fullTaskId}' (raw: ${taskId}).`,
            {
                room: this.fullName,
                fullTaskId: fullTaskId,
                rawTaskId: taskId,
            },
        )
    }

    /**
     * Внутрішній метод для оновлення часу останньої активності.
     * @private
     */
    #updateActivityTime() {
        this.#lastActivityTime = new Date()
    }

    /**
     * Планує задачу для автоматичного видалення порожньої кімнати.
     * Ця задача виконується періодично як "страховка".
     * @private
     */
    #scheduleEmptyRoomCleanup() {
        const baseTaskId = 'cleanup'
        this.#emptyRoomCleanupTaskId = this.#getFullTaskId(baseTaskId)

        this.#taskScheduler.scheduleTask(
            this.#emptyRoomCleanupTaskId,
            () => this.#checkAndTriggerRoomRemoval(),
            {
                intervalMs: this.#emptyRoomCleanupIntervalMs,
                runOnActivation: false,
                allowOverlap: false,
            },
            { roomFullName: this.fullName },
        )
        this.#logger.debug(
            `[Room:${this.fullName}] Scheduled empty room cleanup task (ID: ${
                this.#emptyRoomCleanupTaskId
            }) every ${this.#emptyRoomCleanupIntervalMs}ms.`,
        )
    }

    /**
     * Перевіряє, чи кімната порожня і чи минув її термін життя.
     * Якщо так, викликає колбек для видалення.
     * Цей метод викликається як з періодичної задачі, так і негайно після видалення клієнта.
     * @private
     */
    #checkAndTriggerRoomRemoval() {
        if (!this.#autoCleanupEmptyRoom) {
            // Автоматичне очищення вимкнено, нічого не робимо
            return
        }

        if (this.size > 0) {
            this.#logger.debug(
                `[Room:${this.fullName}] Room is no longer empty, canceling cleanup check.`,
                { room: this.fullName },
            )
            // Оновлюємо час активності, щоб таймер простою починався знову,
            // якщо кімната знову стане порожньою після тимчасового спорожнення.
            this.#updateActivityTime()
            return
        }

        // Якщо ми дійшли сюди, значить autoCleanupEmptyRoom = true І size = 0
        this.#logger.debug(
            `[Room:${
                this.fullName
            }] Performing empty room cleanup check. Last activity: ${this.#lastActivityTime.toISOString()}`,
            { room: this.fullName },
        )
        const timeElapsedSinceLastActivity = Date.now() - this.#lastActivityTime.getTime()

        if (timeElapsedSinceLastActivity >= this.#emptyRoomLifetimeMs) {
            this.#logger.info(
                `[Room:${this.fullName}] Room is empty and has expired after ${timeElapsedSinceLastActivity}ms. Triggering removal.`,
                {
                    room: this.fullName,
                    emptyForMs: timeElapsedSinceLastActivity,
                    thresholdMs: this.#emptyRoomLifetimeMs,
                },
            )
            if (this.#onRoomEmptyAndExpired) {
                // Викликаємо приватний колбек
                this.#onRoomEmptyAndExpired(this.#name, this.#namespace)
            }
        } else {
            this.#logger.debug(
                `[Room:${this.fullName}] Room is empty but has not yet expired. Time left: ${
                    this.#emptyRoomLifetimeMs - timeElapsedSinceLastActivity
                }ms.`,
                {
                    room: this.fullName,
                    emptyForMs: timeElapsedSinceLastActivity,
                    thresholdMs: this.#emptyRoomLifetimeMs,
                    timeLeftMs: this.#emptyRoomLifetimeMs - timeElapsedSinceLastActivity,
                },
            )
        }
    }

    /**
     * Очищає всі ресурси кімнати (зупиняє задачі та сповіщає клієнтів про вихід).
     * Викликається перед видаленням кімнати.
     */
    destroy() {
        this.#taskScheduler.stopAllTasks()

        // Повідомляємо всім клієнтам, що вони покидають цю кімнату
        for (const client of this.#clients.values()) {
            try {
                client.leaveRoom(this.fullName)
            } catch (error) {
                this.#logger.error(
                    `[Room:${this.fullName}] Error notifying client ${client.connectionId} about room destruction: ${error.message}`,
                    {
                        room: this.fullName,
                        connectionId: client.connectionId,
                        userId: client.userId,
                        error: error,
                    },
                )
            }
        }
        this.#clients.clear() // Очищаємо мапу клієнтів

        this.#logger.info(
            `[Room:${this.fullName}] Room destroyed. All tasks stopped and clients notified.`,
            {
                room: this.fullName,
                messagesSentFromRoom: this.#messagesSentFromRoomCount,
            },
        )
    }
}

export default Room
