import { TaskScheduler } from './TaskScheduler.js'
import { IStorage } from '../storage/IStorage.js'
import { WsAdapter } from '../WsAdapter.js'

/**
 * @class Room
 * @description Представляє кімнату для взаємодії користувачів, керує їхнім станом
 * та виконує заплановані задачі. Використовує зовнішні адаптери для зберігання
 * стану та обміну повідомленнями.
 */
class Room {
    #id
    #namespaceId
    #config
    #logger
    #taskScheduler
    #wsAdapter
    #storage
    #removalCallback
    #scheduledTasks = new Map()
    #emptyRoomTimer = null
    #usersCountCache = 0
    #leaderElection

    /**
     * Префікси ключів для сховища.
     * @private
     */
    #USERS_KEY_PREFIX = 'room_users:'
    #ROOM_STATE_KEY = 'room_state:'

    /**
     * @param {string} id - Унікальний ідентифікатор кімнати.
     * @param {string} namespaceId - Ідентифікатор простору імен, до якого належить кімната.
     * @param {object} config - Конфігурація кімнати.
     * @param {boolean} [config.autoDeleteEmpty=true] - Чи видаляти кімнату, якщо вона порожня.
     * @param {number} [config.emptyTimeoutMs=60000] - Час (мс) до видалення порожньої кімнати.
     * @param {object} logger - Екземпляр логера.
     * @param {TaskScheduler} taskScheduler - Екземпляр планувальника задач.
     * @param {WsAdapter} wsAdapter - Екземпляр WebSocket адаптера для розсилки повідомлень.
     * @param {IStorage} storage - Екземпляр сховища для стану кімнати.
     * @param {function(string): Promise<void>} removalCallback - Callback для сповіщення Namespace про видалення.
     * @param {LeaderElection} leaderElection - Екземпляр виборів лідера. (опціонально)
     */
    constructor(
        id,
        namespaceId,
        config,
        logger,
        taskScheduler,
        wsAdapter,
        storage,
        removalCallback,
        leaderElection = null,
    ) {
        this.#id = id
        this.#namespaceId = namespaceId
        this.#config = { autoDeleteEmpty: true, emptyTimeoutMs: 1000 * 60, ...config }
        this.#logger = logger
        this.#taskScheduler = taskScheduler
        this.#wsAdapter = wsAdapter
        this.#storage = storage
        this.#removalCallback = removalCallback
        this.#leaderElection = leaderElection

        this.#logger.debug(
            `Room '${this.#id}' created in namespace '${this.#namespaceId}'. Config:`,
            this.#config,
        )

        // Завантажуємо стан і оновлюємо кеш асинхронно
        this.#loadAndCacheState()
    }

    get id() {
        return this.#id
    }

    get namespaceId() {
        return this.#namespaceId
    }

    /**
     * Приватний метод: Генерує ключ для користувачів кімнати.
     * @private
     * @returns {string}
     */
    #generateUsersKey() {
        return `${this.#USERS_KEY_PREFIX}${this.#namespaceId}:${this.#id}`
    }

    /**
     * Приватний метод: Генерує ключ для стану кімнати.
     * @private
     * @returns {string}
     */
    #generateRoomStateKey() {
        return `${this.#ROOM_STATE_KEY}${this.#namespaceId}:${this.#id}`
    }

    /**
     * Приватний метод: Генерує унікальне ім'я каналу для цієї кімнати.
     * @private
     * @returns {string}
     */
    #getChannelName() {
        return `room:${this.#namespaceId}:${this.#id}`
    }

    /**
     * Повертає кількість користувачів у кімнаті.
     * Звертається до сховища для отримання актуального значення.
     * @returns {number}
     */
    async usersCount() {
        return await this.#storage.getSetSize(this.#generateUsersKey())
    }

    /**
     * Отримує список усіх користувачів у кімнаті.
     * @returns {Promise<Array<string>>}
     */
    async getUsers() {
        const key = this.#generateUsersKey()
        return await this.#storage.getSetMembers(key)
    }

    /**
     * Перевіряє, чи є користувач у кімнаті.
     * @param {string} userId - Ідентифікатор користувача.
     * @returns {Promise<boolean>}
     */
    async hasUser(userId) {
        const users = await this.getUsers()
        return users.includes(userId)
    }

    /**
     * Додає користувача до кімнати.
     * @param {string} userId - Ідентифікатор користувача.
     * @returns {Promise<boolean>} True, якщо користувач був доданий, false, якщо вже був.
     */
    async addUser(userId) {
        const key = this.#generateUsersKey()
        try {
            const added = await this.#storage.addToSet(key, userId)
            if (added) {
                this.#usersCountCache++
                this.#logger.debug(`User '${userId}' joined room '${this.#id}'.`)
                await this.#updateTasksState()
                clearTimeout(this.#emptyRoomTimer)
            } else {
                this.#logger.debug(`User '${userId}' already in room '${this.#id}'.`)
            }
            return added
        } catch (error) {
            this.#logger.error(`Failed to add user '${userId}':`, error)
            return false
        }
    }

    /**
     * Видаляє користувача з кімнати.
     * @param {string} userId - Ідентифікатор користувача.
     * @returns {Promise<boolean>} True, якщо користувач був видалений, false, якщо його не було.
     */
    async removeUser(userId) {
        const key = this.#generateUsersKey()
        try {
            const removed = await this.#storage.removeFromSet(key, userId)
            if (removed) {
                this.#usersCountCache = Math.max(0, this.#usersCountCache - 1)
                this.#logger.debug(`User '${userId}' left room '${this.#id}'.`)
                await this.#updateTasksState()
                await this.#startEmptyRoomTimer()
            } else {
                this.#logger.debug(`User '${userId}' not in room '${this.#id}'.`)
            }
            return removed
        } catch (error) {
            this.#logger.error(`Failed to remove user '${userId}':`, error)
            return false
        }
    }

    /**
     * Відправляє дані всім користувачам у кімнаті через Pub/Sub канал.
     * @param {string} eventName - Назва події для клієнта.
     * @param {object} payload - Дані для відправки.
     * @param {object} [options={}] - Додаткові налаштування для відправки повідомлення.
     * @param {string[]} [excludeUsers=[]] - Масив ідентифікаторів користувачів, яких потрібно виключити з розсилки.
     * @returns {Promise<void>}
     */
    async send(eventName, payload, options = {}, excludeUsers = []) {
        try {
            // Просто публікуємо повідомлення в канал, а WsAdapter його перехопить.
            await this.#wsAdapter.publishRoomMessage(this.#getChannelName(), {
                eventName,
                payload,
                options,
                excludeUsers,
            })

            this.#logger.debug(
                `Published event '${eventName}' to channel '${this.#getChannelName()}'.`,
            )
        } catch (error) {
            this.#logger.error(
                `Failed to publish event '${eventName}' to room '${this.#id}':`,
                error,
            )
        }
    }

    /**
     * Реєструє періодичну задачу для цієї кімнати.
     * @param {string} taskId - Унікальний ідентифікатор задачі.
     * @param {function(any): any} taskFn - Функція, яка буде виконуватися.
     * @param {object} [config={}] - Конфігурація задачі (intervalMs, runOnActivation).
     * @param {number} config.intervalMs - Інтервал виконання в мс.
     * @param {boolean} [config.runOnLeaderOnly=true] - Чи запускати таску тільки на лідері.
     * @param {object} [params={}] - Параметри для taskFn.
     */
    addScheduledTask(taskId, taskFn, config = {}, params = {}) {
        if (this.#scheduledTasks.has(taskId)) {
            this.#logger.warn(`Task '${taskId}' already registered for room '${this.#id}'.`)
            return
        }

        const { runOnLeaderOnly = true } = config

        let taskParams = {}

        // Створюємо функцію-обгортку для перевірки лідерства
        const taskWrapper = async () => {
            // Якщо таска має виконуватись тільки на лідері, і ми не лідер, то виходимо
            if (runOnLeaderOnly && !this.#leaderElection.isLeader()) {
                this.#logger.debug(`Skipping leader-only task '${taskId}' (not a leader).`)
                return
            }

            taskParams = {
                ...params,
                room: this,
                storage: this.#storage,
                wsAdapter: this.#wsAdapter,
                leaderElection: this.#leaderElection,
            }

            // Викликаємо оригінальну функцію таски
            try {
                await taskFn(taskParams)
            } catch (error) {
                this.#logger.error(`Error executing task '${taskId}':`, error)
            }
        }

        // Додаємо обгортку, а не оригінальну функцію, до списку запланованих задач
        this.#scheduledTasks.set(taskId, { taskFn: taskWrapper, config, params: taskParams })

        this.#logger.debug(
            `Task '${taskId}' registered with leader-only option: ${runOnLeaderOnly}`,
        )
        this.#updateTasksState()
    }

    /**
     * Видаляє періодичну задачу з кімнати.
     * @param {string} taskId - Ідентифікатор задачі.
     */
    removeScheduledTask(taskId) {
        if (this.#scheduledTasks.delete(taskId)) {
            this.#taskScheduler.stopTask(`${this.#id}_${taskId}`)
            this.#logger.debug(`Task '${taskId}' removed from room '${this.#id}'.`)
        } else {
            this.#logger.warn(`Task '${taskId}' not found for room '${this.#id}'.`)
        }
    }

    /**
     * Очищає ресурси кімнати перед видаленням.
     */
    async destroy() {
        clearTimeout(this.#emptyRoomTimer)
        this.#scheduledTasks.forEach((_, taskId) => {
            this.#taskScheduler.stopTask(`${this.#id}_${taskId}`)
        })
        this.#scheduledTasks.clear()

        try {
            await this.#storage.delete(this.#generateUsersKey())
            await this.#storage.delete(this.#generateRoomStateKey())
            this.#logger.debug(`Room '${this.#id}' destroyed. All data removed.`)
        } catch (error) {
            this.#logger.error(`Failed to destroy room '${this.#id}' data:`, error)
        }
    }

    /**
     * Приватний метод: Завантажує стан кімнати зі сховища і кешує кількість користувачів.
     * @private
     */
    async #loadAndCacheState() {
        await this.#loadRoomState()
        // this.#usersCountCache = await this.#storage.getSetSize(this.#generateUsersKey())
        // this.#startEmptyRoomTimer()
        // this.#updateTasksState()

        // Прибираємо кеш, оскільки тепер usersCount() звертається до сховища
        const initialUsersCount = await this.usersCount()
        if (initialUsersCount > 0) {
            this.#updateTasksState()
        } else {
            this.#startEmptyRoomTimer()
        }
    }

    /**
     * Приватний метод: Завантажує стан кімнати зі сховища.
     * @private
     */
    async #loadRoomState() {
        try {
            const roomState = await this.#storage.get(this.#generateRoomStateKey())
            if (roomState) {
                this.#config = { ...this.#config, ...roomState.config }
                this.#logger.debug(`Room '${this.#id}' state loaded from storage.`)
            }
        } catch (error) {
            this.#logger.error(`Failed to load room state for '${this.#id}':`, error)
        }
    }

    /**
     * Приватний метод: Зберігає стан кімнати у сховищі.
     * @private
     */
    async #saveRoomState() {
        const roomState = {
            config: this.#config,
        }
        try {
            await this.#storage.set(this.#generateRoomStateKey(), roomState)
        } catch (error) {
            this.#logger.error(`Failed to save room state for '${this.#id}':`, error)
        }
    }

    /**
     * Приватний метод: Запускає таймер для видалення порожньої кімнати.
     * @private
     */
    async #startEmptyRoomTimer() {
        const currentUsersCount = await this.usersCount()
        if (!this.#config.autoDeleteEmpty || /*this.#usersCountCache > 0*/ currentUsersCount > 0) {
            return
        }

        clearTimeout(this.#emptyRoomTimer)
        this.#emptyRoomTimer = setTimeout(async () => {
            const finalUsersCount = await this.usersCount()
            if (/*this.#usersCountCache*/ finalUsersCount === 0) {
                this.#logger.debug(
                    `Room '${this.#id}' is empty for ${
                        this.#config.emptyTimeoutMs
                    }ms. Signaling for removal.`,
                )
                if (this.#removalCallback) {
                    await this.#removalCallback(this.#id)
                }
            }
        }, this.#config.emptyTimeoutMs)
        this.#logger.debug(`Started empty room timer for '${this.#id}'.`)
    }

    /**
     * Приватний метод: Оновлює стан періодичних задач залежно від кількості користувачів.
     * @private
     */
    async #updateTasksState() {
        const hasUsers = (await this.usersCount()) > 0 //this.#usersCountCache > 0
        this.#scheduledTasks.forEach(({ config, taskFn, params }, taskId) => {
            const uniqueTaskId = `room:${this.#id}:${taskId}`

            if (hasUsers && !this.#taskScheduler.hasTask(uniqueTaskId)) {
                this.#taskScheduler.scheduleTask(uniqueTaskId, config, taskFn, params)
                this.#logger.debug(`Room '${this.#id}': Starting task '${taskId}' (users > 0).`)
            } else if (!hasUsers && this.#taskScheduler.hasTask(uniqueTaskId)) {
                this.#taskScheduler.stopTask(uniqueTaskId)
                this.#logger.debug(`Room '${this.#id}': Stopping task '${taskId}' (users = 0).`)
            }
        })
    }
}

export { Room }
