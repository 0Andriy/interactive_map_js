import { v4 as uuidv4 } from 'uuid'

/**
 * @class Room
 * @description Представляє кімнату для взаємодії користувачів.
 */
class Room {
    #id
    #namespaceId
    #users = new Set() // Set<userId>
    #config // Конфігурація кімнати (наприклад, дозволяти видалення)
    #logger
    #taskScheduler
    #scheduledTasks = new Map() // Map<taskId, { taskFn, params }>

    /**
     * @param {string} id - Унікальний ідентифікатор кімнати.
     * @param {string} namespaceId - Ідентифікатор простору імен, до якого належить кімната.
     * @param {object} config - Конфігурація кімнати.
     * @param {boolean} [config.autoDeleteEmpty=true] - Чи видаляти кімнату, якщо вона порожня.
     * @param {number} [config.emptyTimeoutMs=60000] - Час (мс) до видалення порожньої кімнати.
     * @param {ILogger} logger - Екземпляр логера.
     * @param {TaskScheduler} taskScheduler - Екземпляр планувальника задач.
     */
    constructor(id, namespaceId, config, logger, taskScheduler) {
        this.#id = id
        this.#namespaceId = namespaceId
        this.#config = { autoDeleteEmpty: true, emptyTimeoutMs: 60000, ...config }
        this.#logger = logger
        this.#taskScheduler = taskScheduler
        this.#logger.log(
            `Room '${this.#id}' created in namespace '${this.#namespaceId}'. Config:`,
            this.#config,
        )
        this.#startEmptyRoomTimer()
    }

    get id() {
        return this.#id
    }

    get namespaceId() {
        return this.#namespaceId
    }

    get usersCount() {
        return this.#users.size
    }

    /**
     * Додає користувача до кімнати.
     * @param {string} userId - Ідентифікатор користувача.
     * @returns {boolean} True, якщо користувач був доданий, false, якщо вже був.
     */
    addUser(userId) {
        if (this.#users.has(userId)) {
            this.#logger.debug(`User '${userId}' already in room '${this.#id}'.`)
            return false
        }
        this.#users.add(userId)
        this.#logger.log(`User '${userId}' joined room '${this.#id}'. Users: ${this.usersCount}`)
        this.#updateTasksState()
        return true
    }

    /**
     * Видаляє користувача з кімнати.
     * @param {string} userId - Ідентифікатор користувача.
     * @returns {boolean} True, якщо користувач був видалений, false, якщо його не було.
     */
    removeUser(userId) {
        if (!this.#users.has(userId)) {
            this.#logger.debug(`User '${userId}' not in room '${this.#id}'.`)
            return false
        }
        this.#users.delete(userId)
        this.#logger.log(`User '${userId}' left room '${this.#id}'. Users: ${this.usersCount}`)
        this.#updateTasksState()
        this.#startEmptyRoomTimer() // Перезапустити таймер на видалення, якщо кімната порожня
        return true
    }

    /**
     * Перевіряє, чи є користувач у кімнаті.
     * @param {string} userId - Ідентифікатор користувача.
     * @returns {boolean}
     */
    hasUser(userId) {
        return this.#users.has(userId)
    }

    /**
     * Отримує список усіх користувачів у кімнаті.
     * @returns {Array<string>}
     */
    getUsers() {
        return Array.from(this.#users)
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
        // Передаємо екземпляр кімнати (this) та об'єкт-сервер WebSocket як параметри
        const taskParams = { ...params, room: this, wsAdapter: this.#wsAdapter } // wsAdapter буде переданий ззовні
        this.#scheduledTasks.set(taskId, { config, taskFn, params: taskParams }) // Зберігаємо розширені параметри
        this.#logger.log(`Task '${taskId}' registered for room '${this.#id}'.`)
        this.#updateTasksState()
    }

    /**
     * Видаляє періодичну задачу з кімнати.
     * @param {string} taskId - Ідентифікатор задачі.
     */
    removeScheduledTask(taskId) {
        if (this.#scheduledTasks.delete(taskId)) {
            this.#taskScheduler.stopTask(`${this.#id}_${taskId}`) // Зупинити задачу в планувальнику
            this.#logger.log(`Task '${taskId}' removed from room '${this.#id}'.`)
        } else {
            this.#logger.warn(`Task '${taskId}' not found for room '${this.#id}'.`)
        }
    }

    /**
     * Приватний метод: Оновлює стан періодичних задач залежно від кількості користувачів.
     * Якщо користувачів > 0, задачі запускаються. Якщо 0, задачі зупиняються.
     */
    #updateTasksState() {
        const hasUsers = this.usersCount > 0
        this.#scheduledTasks.forEach(({ config, taskFn, params }, taskId) => {
            const uniqueTaskId = `${this.#id}_${taskId}` // Унікальний ID задачі в рамках планувальника

            if (hasUsers && !this.#taskScheduler.hasTask(uniqueTaskId)) {
                this.#taskScheduler.scheduleTask(uniqueTaskId, config, taskFn, params)
                this.#logger.debug(`Room '${this.#id}': Starting task '${taskId}' (users > 0).`)
            } else if (!hasUsers && this.#taskScheduler.hasTask(uniqueTaskId)) {
                this.#taskScheduler.stopTask(uniqueTaskId)
                this.#logger.debug(`Room '${this.#id}': Stopping task '${taskId}' (users = 0).`)
            }
        })
    }

    #emptyRoomTimer = null

    #startEmptyRoomTimer() {
        if (!this.#config.autoDeleteEmpty) {
            return
        }

        clearTimeout(this.#emptyRoomTimer) // Очистити попередній таймер
        if (this.usersCount === 0) {
            this.#emptyRoomTimer = setTimeout(() => {
                if (this.usersCount === 0) {
                    this.#logger.log(
                        `Room '${this.#id}' is empty for ${
                            this.#config.emptyTimeoutMs
                        }ms. Marking for removal.`,
                    )
                    // Повідомити Namespace про необхідність видалення кімнати
                    this.emit('roomEmptyAndReadyForRemoval', this.#id)
                }
            }, this.#config.emptyTimeoutMs)
            this.#logger.debug(`Started empty room timer for '${this.#id}'.`)
        }
    }

    // Для внутрішньої комунікації, можна використати EventEmitter
    // Або передати callback для видалення кімнати
    // Для простоти, в цьому прикладі просто викличемо callback з Namespace
    emit(eventName, ...args) {
        // Заглушка, в реальному застосунку буде EventEmitter або подібний механізм
        if (eventName === 'roomEmptyAndReadyForRemoval') {
            this.#logger.debug(`Room '${this.#id}' wants to be removed.`)
            // Приклад: в реальному коді Namespace підписався б на цю подію
            // Або Room має метод `notifyParentForRemoval`
        }
    }

    /**
     * Очищає ресурси кімнати перед видаленням.
     */
    destroy() {
        clearTimeout(this.#emptyRoomTimer)
        this.#scheduledTasks.forEach((_, taskId) => {
            this.#taskScheduler.stopTask(`${this.#id}_${taskId}`)
        })
        this.#scheduledTasks.clear()
        this.#users.clear()
        this.#logger.log(`Room '${this.#id}' destroyed.`)
    }
}

export { Room }
