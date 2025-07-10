import { TaskScheduler } from './TaskScheduler.js' // Зберігається
import { IStorage } from '../interfaces/IStorage.js'
import { ILogger } from '../interfaces/ILogger.js'
import { WsAdapter } from '../adapters/WsAdapter.js' // Зберігається

/**
 * @class Room
 * @description Представляє кімнату для взаємодії користувачів.
 */
class Room {
    #id
    #namespaceId
    #config
    #logger
    #taskScheduler
    #wsAdapter // Для відправки повідомлень користувачам
    #storage // IStorage для керування користувачами кімнати
    #scheduledTasks = new Map() // Map<taskId, { taskFn, params }>

    // Ключі для сховища
    #USERS_KEY_PREFIX = 'room_users:' // room_users:{namespaceId}:{roomId}
    #ROOM_STATE_KEY = 'room_state:' // room_state:{namespaceId}:{roomId}

    #emptyRoomTimer = null
    #removalCallback // Callback, який викликається для видалення кімнати з Namespace

    /**
     * @param {string} id - Унікальний ідентифікатор кімнати.
     * @param {string} namespaceId - Ідентифікатор простору імен, до якого належить кімната.
     * @param {object} config - Конфігурація кімнати.
     * @param {boolean} [config.autoDeleteEmpty=true] - Чи видаляти кімнату, якщо вона порожня.
     * @param {number} [config.emptyTimeoutMs=60000] - Час (мс) до видалення порожньої кімнати.
     * @param {ILogger} logger - Екземпляр логера.
     * @param {TaskScheduler} taskScheduler - Екземпляр планувальника задач.
     * @param {WsAdapter} wsAdapter - Екземпляр WebSocket адаптера для розсилки повідомлень.
     * @param {IStorage} storage - Екземпляр сховища для стану кімнати.
     * @param {function(string): Promise<void>} removalCallback - Callback для сповіщення Namespace про видалення.
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
    ) {
        this.#id = id
        this.#namespaceId = namespaceId
        this.#config = { autoDeleteEmpty: true, emptyTimeoutMs: 60000, ...config }
        this.#logger = logger
        this.#taskScheduler = taskScheduler
        this.#wsAdapter = wsAdapter
        this.#storage = storage
        this.#removalCallback = removalCallback

        this.#logger.log(
            `Room '${this.#id}' created in namespace '${this.#namespaceId}'. Config:`,
            this.#config,
        )
        // Завантажуємо початковий стан кімнати (якщо є)
        this.#loadRoomState()
        this.#startEmptyRoomTimer() // Запускаємо таймер на випадок, якщо кімната була порожня при старті
    }

    get id() {
        return this.#id
    }

    get namespaceId() {
        return this.#namespaceId
    }

    async usersCount() {
        const key = this.#USERS_KEY_PREFIX + this.#namespaceId + ':' + this.#id
        return await this.#storage.getSetSize(key)
    }

    async #loadRoomState() {
        const roomState = await this.#storage.get(
            this.#ROOM_STATE_KEY + this.#namespaceId + ':' + this.#id,
        )
        if (roomState) {
            // Можна завантажити більше стану, якщо потрібно
            this.#config = { ...this.#config, ...roomState.config }
            this.#logger.debug(`Room '${this.#id}' state loaded from storage.`)
        }
        // Оновлюємо стан задач після завантаження користувачів
        await this.#updateTasksState()
    }

    async #saveRoomState() {
        const roomState = {
            config: this.#config,
            // Додати інший стан кімнати, який має бути персистентним
        }
        await this.#storage.set(
            this.#ROOM_STATE_KEY + this.#namespaceId + ':' + this.#id,
            roomState,
        )
    }

    /**
     * Додає користувача до кімнати.
     * @param {string} userId - Ідентифікатор користувача.
     * @returns {Promise<boolean>} True, якщо користувач був доданий, false, якщо вже був.
     */
    async addUser(userId) {
        const key = this.#USERS_KEY_PREFIX + this.#namespaceId + ':' + this.#id
        const added = await this.#storage.addToSet(key, userId)
        if (added) {
            this.#logger.log(
                `User '${userId}' joined room '${this.#id}'. Users: ${await this.usersCount()}`,
            )
            await this.#updateTasksState()
            clearTimeout(this.#emptyRoomTimer) // Скинути таймер, якщо хтось зайшов
        } else {
            this.#logger.debug(`User '${userId}' already in room '${this.#id}'.`)
        }
        return added
    }

    /**
     * Видаляє користувача з кімнати.
     * @param {string} userId - Ідентифікатор користувача.
     * @returns {Promise<boolean>} True, якщо користувач був видалений, false, якщо його не було.
     */
    async removeUser(userId) {
        const key = this.#USERS_KEY_PREFIX + this.#namespaceId + ':' + this.#id
        const removed = await this.#storage.removeFromSet(key, userId)
        if (removed) {
            this.#logger.log(
                `User '${userId}' left room '${this.#id}'. Users: ${await this.usersCount()}`,
            )
            await this.#updateTasksState()
            await this.#startEmptyRoomTimer() // Перезапустити таймер на видалення
        } else {
            this.#logger.debug(`User '${userId}' not in room '${this.#id}'.`)
        }
        return removed
    }

    /**
     * Перевіряє, чи є користувач у кімнаті.
     * @param {string} userId - Ідентифікатор користувача.
     * @returns {Promise<boolean>}
     */
    async hasUser(userId) {
        const users = await this.getUsers() // Отримуємо всіх користувачів
        return users.includes(userId)
    }

    /**
     * Отримує список усіх користувачів у кімнаті.
     * @returns {Promise<Array<string>>}
     */
    async getUsers() {
        const key = this.#USERS_KEY_PREFIX + this.#namespaceId + ':' + this.#id
        return await this.#storage.getSetMembers(key)
    }

    /**
     * Реєструє періодичну задачу для цієї кімнати.
     * @param {string} taskId - Унікальний ідентифікатор задачі.
     * @param {object} config - Конфігурація задачі (intervalMs, runOnActivation).
     * @param {function(any): any} taskFn - Функція, яка буде виконуватися.
     * @param {object} [params={}] - Параметри для taskFn.
     */
    addScheduledTask(taskId, config, taskFn, params = {}) {
        if (this.#scheduledTasks.has(taskId)) {
            this.#logger.warn(`Task '${taskId}' already registered for room '${this.#id}'.`)
            return
        }
        const taskParams = { ...params, room: this, wsAdapter: this.#wsAdapter } // Передаємо Room і WsAdapter
        this.#scheduledTasks.set(taskId, { config, taskFn, params: taskParams })
        this.#logger.log(`Task '${taskId}' registered for room '${this.#id}'.`)
        this.#updateTasksState()
    }

    /**
     * Видаляє періодичну задачу з кімнати.
     * @param {string} taskId - Ідентифікатор задачі.
     */
    removeScheduledTask(taskId) {
        if (this.#scheduledTasks.delete(taskId)) {
            this.#taskScheduler.stopTask(`${this.#id}_${taskId}`)
            this.#logger.log(`Task '${taskId}' removed from room '${this.#id}'.`)
        } else {
            this.#logger.warn(`Task '${taskId}' not found for room '${this.#id}'.`)
        }
    }

    /**
     * Приватний метод: Оновлює стан періодичних задач залежно від кількості користувачів.
     */
    async #updateTasksState() {
        const hasUsers = (await this.usersCount()) > 0
        this.#scheduledTasks.forEach(({ config, taskFn, params }, taskId) => {
            const uniqueTaskId = `${this.#id}_${taskId}`

            if (hasUsers && !this.#taskScheduler.hasTask(uniqueTaskId)) {
                this.#taskScheduler.scheduleTask(uniqueTaskId, config, taskFn, params)
                this.#logger.debug(`Room '${this.#id}': Starting task '${taskId}' (users > 0).`)
            } else if (!hasUsers && this.#taskScheduler.hasTask(uniqueTaskId)) {
                this.#taskScheduler.stopTask(uniqueTaskId)
                this.#logger.debug(`Room '${this.#id}': Stopping task '${taskId}' (users = 0).`)
            }
        })
    }

    async #startEmptyRoomTimer() {
        if (!this.#config.autoDeleteEmpty) {
            return
        }

        clearTimeout(this.#emptyRoomTimer)
        if ((await this.usersCount()) === 0) {
            this.#emptyRoomTimer = setTimeout(async () => {
                if ((await this.usersCount()) === 0) {
                    this.#logger.log(
                        `Room '${this.#id}' is empty for ${
                            this.#config.emptyTimeoutMs
                        }ms. Signaling for removal.`,
                    )
                    if (this.#removalCallback) {
                        await this.#removalCallback(this.#id) // Повідомити Namespace про видалення
                    }
                }
            }, this.#config.emptyTimeoutMs)
            this.#logger.debug(`Started empty room timer for '${this.#id}'.`)
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

        // Видалити дані кімнати зі сховища
        const usersKey = this.#USERS_KEY_PREFIX + this.#namespaceId + ':' + this.#id
        const stateKey = this.#ROOM_STATE_KEY + this.#namespaceId + ':' + this.#id
        await this.#storage.delete(usersKey)
        await this.#storage.delete(stateKey)

        this.#logger.log(`Room '${this.#id}' destroyed.`)
    }
}

export { Room }
