/**
 * @file Room.js
 * @description Реалізує логіку кімнати, керує користувачами та її станом.
 * Взаємодіє зі сховищем для персистентності та з WsAdapter для комунікації з клієнтами.
 */

import { TaskScheduler } from './TaskScheduler.js'
import { IStorage } from '../storage/IStorage.js'
import { WsAdapter } from '../WsAdapter.js'
import { LeaderElection } from '../LeaderElection.js'
import { ILogger } from '../interfaces/ILogger.js'

/**
 * @typedef {object} RoomConfig
 * @property {number} [maxUsers=100] - Максимальна кількість користувачів у кімнаті.
 * @property {number} [emptyRoomTimeoutMs=300000] - Час у мс, після якого порожня кімната буде знищена.
 */

/**
 * @class Room
 * @description Керує логікою окремої кімнати, включаючи користувачів, стан та взаємодію.
 * @property {string} #id - Унікальний ідентифікатор кімнати.
 * @property {string} #namespaceId - Ідентифікатор простору імен, до якого належить кімната.
 * @property {RoomConfig} #config - Конфігурація кімнати.
 * @property {ILogger} #logger - Екземпляр логера.
 * @property {TaskScheduler} #roomTaskScheduler - Планувальник задач для цієї кімнати.
 * @property {WsAdapter} #wsAdapter - Екземпляр WebSocket адаптера.
 * @property {IStorage} #storage - Екземпляр сховища.
 * @property {Function} #destroyCallback - Коллбек для сповіщення батьківського Namespace про знищення кімнати.
 * @property {LeaderElection|null} #leaderElection - Екземпляр LeaderElection.
 * @property {string} #roomUsersSetKey - Ключ у сховищі для Set користувачів кімнати.
 * @property {string} #roomStateHashKey - Ключ у сховищі для Hash стану кімнати.
 * @property {NodeJS.Timeout|null} #emptyRoomTimer - Таймер для знищення порожньої кімнати.
 * @property {Set<string>} #localActiveUsers - Локально кешований Set активних користувачів, що мають принаймні один сокет, підключений до *цього* інстансу.
 */
class Room {
    #id
    #namespaceId
    #config
    #logger
    #roomTaskScheduler
    #wsAdapter
    #storage
    #destroyCallback
    #leaderElection
    #roomUsersSetKey
    #roomStateHashKey
    #emptyRoomTimer = null
    #localActiveUsers = new Set() // Користувачі, що підключені через цей інстанс

    /**
     * @constructor
     * @param {string} id - Унікальний ідентифікатор кімнати.
     * @param {string} namespaceId - Ідентифікатор простору імен.
     * @param {RoomConfig} config - Конфігурація кімнати.
     * @param {ILogger} logger - Екземпляр логера.
     * @param {TaskScheduler} globalTaskScheduler - Глобальний планувальник задач (для глобальних задач кімнати).
     * @param {WsAdapter} wsAdapter - Екземпляр WebSocket адаптера.
     * @param {IStorage} storage - Екземпляр сховища.
     * @param {Function} destroyCallback - Коллбек, який викликається при знищенні кімнати.
     * @param {LeaderElection} [leaderElection=null] - Екземпляр LeaderElection.
     */
    constructor(
        id,
        namespaceId,
        config,
        logger,
        globalTaskScheduler, // Використовуємо глобальний планувальник для задач, пов'язаних з кімнатою, але які можуть вимагати лідерства або бути загальними.
        wsAdapter,
        storage,
        destroyCallback,
        leaderElection = null,
    ) {
        this.#id = id
        this.#namespaceId = namespaceId
        this.#config = {
            maxUsers: null,
            emptyRoomTimeoutMs: 300000, // 5 хвилин
            ...config,
        }
        this.#logger = logger
        // Можна використовувати окремий TaskScheduler для кімнати, якщо у неї є багато локальних таймерів,
        // або використовувати глобальний, якщо задачі кімнати нечисленні або вимагають лідерства.
        // Для простоти, продовжимо використовувати глобальний, як у попередніх прикладах,
        // щоб використовувати функціональність runOnlyOnLeader.
        this.#roomTaskScheduler = globalTaskScheduler
        this.#wsAdapter = wsAdapter
        this.#storage = storage
        this.#destroyCallback = destroyCallback
        this.#leaderElection = leaderElection

        this.#roomUsersSetKey = `ns:${namespaceId}:room:${id}:users`
        this.#roomStateHashKey = `ns:${namespaceId}:room:${id}:state`

        this.#logger.debug(`Room '${this.#id}' initialized in namespace '${this.#namespaceId}'.`)

        this.#resetEmptyRoomTimer() // Запускаємо таймер при створенні кімнати
    }

    /**
     * Повертає ID кімнати.
     * @returns {string}
     */
    get id() {
        return this.#id
    }

    /**
     * Повертає ID простору імен.
     * @returns {string}
     */
    get namespaceId() {
        return this.#namespaceId
    }

    /**
     * Повертає поточну кількість користувачів у кімнаті.
     * @returns {Promise<number>}
     */
    async getUserCount() {
        const users = await this.#storage.getSetMembers(this.#roomUsersSetKey)
        return users.length
    }

    /**
     * Додає користувача до кімнати.
     * @async
     * @param {string} userId - ID користувача.
     * @param {string} socketId - ID сокета користувача, який приєднався.
     * @returns {Promise<boolean>} True, якщо користувач був доданий (або вже був у кімнаті).
     */
    async addUser(userId, socketId) {
        const userCount = await this.getUserCount()
        if (this.#config.maxUsers && userCount >= this.#config.maxUsers) {
            this.#logger.warn(
                `Room '${this.#id}' is full. User '${userId}' cannot join. Max: ${
                    this.#config.maxUsers
                }`,
            )
            return false
        }

        const addedToStorage = await this.#storage.addToSet(this.#roomUsersSetKey, userId)

        if (addedToStorage) {
            this.#logger.info(`User '${userId}' joined room '${this.#id}'.`)
            this.#resetEmptyRoomTimer()
        } else {
            this.#logger.debug(`User '${userId}' already in room '${this.#id}'.`)
        }

        // Відстежуємо локальні сокети для цього інстансу
        this.#localActiveUsers.add(userId)
        this.#wsAdapter.addSocketToRoom(socketId, this.#id)

        return true
    }

    /**
     * Видаляє користувача з кімнати.
     * Цей метод має бути викликаний для всіх кімнат, в яких був користувач при відключенні його сокета.
     * @async
     * @param {string} userId - ID користувача.
     * @param {string} [socketId=null] - Опціонально: ID сокета, який відключається.
     * Якщо надано, видаляємо лише цей сокет. Якщо null, передбачаємо, що користувач більше не має активних сокетів.
     * @returns {Promise<boolean>} True, якщо користувач був видалений.
     */
    async removeUser(userId, socketId = null) {
        // Якщо вказано socketId, ми видаляємо його з локального відстеження кімнат.
        if (socketId) {
            this.#wsAdapter.removeSocketFromRoom(socketId, this.#id)
            // Перевіряємо, чи є у користувача інші активні сокети в цій кімнаті на цьому інстансі
            const hasOtherActiveSocketsInRoom = this.#wsAdapter.sendMessageToUser(userId, {
                type: 'ping',
            }) // Спроба надіслати щось користувачу
            if (hasOtherActiveSocketsInRoom) {
                // Якщо є інші активні сокети, не видаляємо користувача з персистентності
                this.#logger.debug(
                    `User '${userId}' disconnected one socket from room '${
                        this.#id
                    }', but has other active sockets.`,
                )
                return false // Повертаємо false, оскільки користувач все ще "присутній"
            }
        }

        // Якщо немає активних сокетів для цього userId на цьому інстансі,
        // або якщо socketId не було надано (означає повне відключення користувача),
        // тоді видаляємо користувача з персистентності.
        const removedFromStorage = await this.#storage.removeFromSet(this.#roomUsersSetKey, userId)

        if (removedFromStorage) {
            this.#logger.info(`User '${userId}' left room '${this.#id}'.`)
            this.#localActiveUsers.delete(userId) // Видаляємо з локального кешу

            const userCount = await this.getUserCount()
            if (userCount === 0) {
                this.#resetEmptyRoomTimer()
            }
        } else {
            this.#logger.debug(`User '${userId}' not found in room '${this.#id}'.`)
        }
        return true
    }

    /**
     * Перевіряє, чи є користувач у кімнаті.
     * @async
     * @param {string} userId - ID користувача.
     * @returns {Promise<boolean>}
     */
    async hasUser(userId) {
        return this.#storage.isSetMember(this.#roomUsersSetKey, userId)
    }

    /**
     * Надсилає повідомлення всім користувачам у кімнаті.
     * @async
     * @param {string} type - Тип повідомлення.
     * @param {object} payload - Корисне навантаження повідомлення.
     * @param {object} [options={}] - Опції для надсилання повідомлення (наприклад, { excludeUsers: [] }).
     * @param {string[]} [excludeUsers=[]] - Масив ID користувачів, яким не слід надсилати повідомлення.
     * @returns {Promise<void>}
     */
    async send(type, payload, options = {}, excludeUsers = []) {
        const allUsersInRoom = await this.#storage.getSetMembers(this.#roomUsersSetKey)
        const usersToSend = allUsersInRoom.filter((uid) => !excludeUsers.includes(uid))

        const message = {
            namespaceId: this.#namespaceId,
            roomId: this.#id,
            type: type,
            payload: payload,
        }

        if (options.to && options.to.length > 0) {
            // Якщо вказані конкретні користувачі, відправляємо лише їм.
            const targetUsers = usersToSend.filter((uid) => options.to.includes(uid))
            this.#wsAdapter.broadcastToUsers(targetUsers, message, options.wsSendOptions)
            this.#logger.debug(
                `Sent message '${type}' to specific users in room '${this.#id}': ${targetUsers.join(
                    ', ',
                )}`,
            )
        } else {
            // Відправляємо всім іншим користувачам у кімнаті.
            this.#wsAdapter.broadcastToUsers(usersToSend, message, options.wsSendOptions)
            this.#logger.debug(
                `Sent message '${type}' to room '${this.#id}' (total users: ${
                    usersToSend.length
                }).`,
            )
        }
    }

    /**
     * Встановлює стан кімнати (або оновлює його частково).
     * @async
     * @param {object} state - Об'єкт стану, поля якого будуть встановлені.
     * @returns {Promise<void>}
     */
    async setState(state) {
        for (const key in state) {
            if (Object.prototype.hasOwnProperty.call(state, key)) {
                await this.#storage.hset(this.#roomStateHashKey, key, JSON.stringify(state[key]))
            }
        }
        this.#logger.debug(`Room '${this.#id}' state updated.`)
    }

    /**
     * Отримує повний стан кімнати.
     * @async
     * @returns {Promise<object>}
     */
    async getState() {
        const rawState = await this.#storage.hgetall(this.#roomStateHashKey)
        const state = {}
        for (const key in rawState) {
            if (Object.prototype.hasOwnProperty.call(rawState, key)) {
                try {
                    state[key] = JSON.parse(rawState[key])
                } catch (e) {
                    state[key] = rawState[key] // Залишаємо як рядок, якщо не вдалося розпарсити
                    this.#logger.warn(
                        `Failed to parse room state field '${key}' for room '${this.#id}':`,
                        e,
                    )
                }
            }
        }
        return state
    }

    /**
     * Планує задачу для цієї кімнати.
     * Використовує глобальний планувальник, але додає префікс для унікальності.
     * @param {string} taskId - Унікальний ідентифікатор задачі в межах кімнати.
     * @param {object} config - Конфігурація задачі (intervalMs, runImmediately, runOnlyOnLeader).
     * @param {Function} taskFn - Функція, яка буде виконуватися.
     * @param {object} [params={}] - Додаткові параметри для taskFn.
     */
    scheduleTask(taskId, config, taskFn, params = {}) {
        const uniqueTaskId = `ns:${this.#namespaceId}:room:${this.#id}:task:${taskId}`

        // Wrapped task function to pass room context
        const wrappedTaskFn = async (taskParams) => {
            return taskFn(this, taskParams) // Передаємо інстанс кімнати та інші параметри
        }

        this.#roomTaskScheduler.scheduleTask(uniqueTaskId, config, wrappedTaskFn, params)
        this.#logger.debug(`Task '${taskId}' scheduled for room '${this.#id}'.`)
    }

    /**
     * Зупиняє задачу для цієї кімнати.
     * @param {string} taskId - Ідентифікатор задачі.
     */
    stopTask(taskId) {
        const uniqueTaskId = `ns:${this.#namespaceId}:room:${this.#id}:task:${taskId}`
        this.#roomTaskScheduler.stopTask(uniqueTaskId)
        this.#logger.debug(`Task '${taskId}' stopped for room '${this.#id}'.`)
    }

    /**
     * Скидає таймер знищення порожньої кімнати.
     * Якщо кімната стає порожньою, таймер запускається. Якщо в кімнату заходять, таймер скидається.
     * @private
     */
    #resetEmptyRoomTimer() {
        if (this.#emptyRoomTimer) {
            clearTimeout(this.#emptyRoomTimer)
            this.#emptyRoomTimer = null
        }

        // Перевіряємо кількість користувачів, щоб не запускати таймер, якщо кімната не порожня
        this.getUserCount().then((count) => {
            if (count === 0 && this.#config.emptyRoomTimeoutMs > 0) {
                this.#emptyRoomTimer = setTimeout(async () => {
                    const currentCount = await this.getUserCount()
                    if (currentCount === 0) {
                        this.#logger.info(
                            `Room '${this.#id}' is empty for ${
                                this.#config.emptyRoomTimeoutMs / 1000
                            } seconds. Initiating destruction.`,
                        )
                        // Викликаємо колбек, щоб Namespace видалив кімнату
                        this.#destroyCallback(this.#id)
                    } else {
                        this.#logger.debug(
                            `Room '${
                                this.#id
                            }' had users join before empty room timeout. Timer reset.`,
                        )
                    }
                }, this.#config.emptyRoomTimeoutMs)
                this.#logger.debug(
                    `Empty room timer started for room '${this.#id}'. Will destroy in ${
                        this.#config.emptyRoomTimeoutMs / 1000
                    }s if remains empty.`,
                )
            } else {
                this.#logger.debug(
                    `Room '${
                        this.#id
                    }' is not empty or emptyRoomTimeoutMs is 0. Empty room timer not started/reset.`,
                )
            }
        })
    }

    /**
     * Знищує кімнату: зупиняє всі її задачі та очищає її стан зі сховища.
     * @async
     * @returns {Promise<void>}
     */
    async destroy() {
        if (this.#emptyRoomTimer) {
            clearTimeout(this.#emptyRoomTimer)
            this.#emptyRoomTimer = null
        }

        // Зупиняємо всі задачі, пов'язані з цією кімнатою, використовуючи її префікс
        const roomTaskPrefix = `ns:${this.#namespaceId}:room:${this.#id}:task:`
        // Оскільки #roomTaskScheduler може бути глобальним, нам потрібно знати всі його задачі
        // або мати метод у TaskScheduler для зупинки за префіксом.
        // Для спрощення, TaskScheduler не має методу для зупинки за префіксом.
        // Тому ми покладаємося на те, що Room просто зупиняє свої індивідуальні задачі,
        // а не "всі задачі з префіксом". Це означає, що Room має відстежувати
        // ID всіх задач, які вона сама запланувала, щоб зупинити їх.
        // Наразі приклад використовує #roomTaskScheduler.stopTask(uniqueTaskId)
        // що є коректним для індивідуальних задач.

        // Очищаємо стан кімнати зі сховища
        await this.#storage.delete(this.#roomUsersSetKey)
        await this.#storage.delete(this.#roomStateHashKey)

        this.#localActiveUsers.clear() // Очищаємо локальний кеш активних користувачів

        this.#logger.info(
            `Room '${this.#id}' successfully destroyed and state cleared from storage.`,
        )
    }
}

export { Room }
