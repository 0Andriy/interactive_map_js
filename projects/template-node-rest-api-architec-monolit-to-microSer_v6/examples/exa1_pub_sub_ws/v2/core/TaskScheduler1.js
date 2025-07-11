import { v4 as uuidv4 } from 'uuid'

/**
 * @typedef {object} TaskConfig
 * @property {number} [intervalMs=1000] - Інтервал виконання в мілісекундах. Значення має бути > 0 для періодичного виклику.
 * @property {boolean} [runOnActivation=false] - Чи запускати задачу негайно при активації.
 * @property {boolean} [allowOverlap=false] - Чи дозволяти перекриття (гонку умов).
 * Якщо `false`, використовується рекурсивний setTimeout для запобігання перекриттю.
 * Якщо `true`, використовується setInterval для запуску за фіксованим розкладом.
 */

/**
 * @typedef {object} TaskData
 * @property {NodeJS.Timeout|null} timerId - Ідентифікатор таймера або `null`, якщо періодичний запуск не встановлено.
 * @property {TaskConfig} config - Об'єкт конфігурації задачі.
 * @property {function(object): any} executeFn - Функція, яка буде виконуватися.
 * @property {object} params - Параметри, що будуть передані в executeFn.
 */

/**
 * @class TaskScheduler
 * @description Управляє плануванням, запуском, зупинкою та моніторингом періодичних, а також одноразових задач.
 */
class TaskScheduler {
    /** @private @type {Map<string, TaskData>} */
    #tasks = new Map()
    /** @private @type {object} */
    #logger

    /**
     * @constructor
     * @param {object} logger - Об'єкт логера.
     */
    constructor(logger) {
        this.#logger = logger
    }

    /**
     * Планує нову періодичну задачу з наданим ID.
     * @public
     * @param {string} taskId - Унікальний ідентифікатор задачі.
     * @param {function(object): any} executeFn - Функція, яка буде виконуватися.
     * @param {TaskConfig} [config={}] - Об'єкт конфігурації задачі.
     * @param {object} [params={}] - Параметри, які будуть передані в executeFn.
     * @returns {void}
     */
    scheduleTask(taskId, executeFn, config = {}, params = {}) {
        if (this.#tasks.has(taskId)) {
            this.#logger.warn(`Task with ID ${taskId} already scheduled. Stopping existing one.`)
            this.stopTask(taskId)
        }

        const finalConfig = {
            intervalMs: 1000,
            runOnActivation: false,
            allowOverlap: false,
            ...config,
        }

        const taskWrapper = async () => {
            try {
                this.#logger.debug(`Executing task ${taskId}...`)
                const result = await executeFn(params)
                this.#logger.debug(`Task ${taskId} executed. Result:`, result)
            } catch (error) {
                this.#logger.error(`Error executing task ${taskId}:`, error)
            }
        }

        const taskData = {
            timerId: null,
            config: finalConfig,
            executeFn,
            params,
        }
        this.#tasks.set(taskId, taskData)

        // Плануємо періодичний запуск тільки якщо інтервал > 0
        if (finalConfig.intervalMs > 0) {
            if (finalConfig.allowOverlap) {
                const timerId = setInterval(taskWrapper, finalConfig.intervalMs)
                taskData.timerId = timerId
            } else {
                const recursiveWrapper = async () => {
                    await taskWrapper()
                    const task = this.#tasks.get(taskId)
                    if (task) {
                        const timerId = setTimeout(recursiveWrapper, finalConfig.intervalMs)
                        task.timerId = timerId
                    }
                }
                const timerId = setTimeout(recursiveWrapper, finalConfig.intervalMs)
                taskData.timerId = timerId
            }
            this.#logger.debug(
                `Task ${taskId} scheduled with interval ${finalConfig.intervalMs}ms.`,
            )
        } else {
            this.#logger.debug(`Task ${taskId} scheduled as non-periodic (intervalMs <= 0).`)
        }

        if (finalConfig.runOnActivation) {
            this.#logger.debug(`Running task ${taskId} immediately on activation.`)
            taskWrapper()
        }

        this.#logger.info(`Task ${taskId} has been scheduled successfully.`)
    }

    /**
     * Планує нову періодичну задачу з автоматично згенерованим ID.
     * @public
     * @param {function(object): any} executeFn - Функція, яка буде виконуватися.
     * @param {TaskConfig} [config={}] - Об'єкт конфігурації задачі.
     * @param {object} [params={}] - Параметри, які будуть передані в executeFn.
     * @returns {string} Згенерований ID задачі.
     */
    scheduleAnonymousTask(executeFn, config = {}, params = {}) {
        const taskId = uuidv4()
        this.scheduleTask(taskId, executeFn, config, params)
        return taskId
    }

    /**
     * Зупиняє заплановану задачу.
     * @public
     * @param {string} taskId - Ідентифікатор задачі.
     * @returns {void}
     */
    stopTask(taskId) {
        const task = this.#tasks.get(taskId)
        if (task) {
            if (task.timerId) {
                if (task.config.allowOverlap) {
                    clearInterval(task.timerId)
                } else {
                    clearTimeout(task.timerId)
                }
            }
            this.#tasks.delete(taskId)
            this.#logger.debug(`Task ${taskId} stopped and unscheduled.`)
        } else {
            this.#logger.warn(`Attempted to stop non-existent task: ${taskId}`)
        }
    }

    /**
     * Ручний запуск запланованої задачі.
     * @public
     * @param {string} taskId - Ідентифікатор задачі.
     * @returns {Promise<any>|void} Проміс з результатом виконання або `void`, якщо задачу не знайдено.
     */
    async runTask(taskId) {
        const task = this.#tasks.get(taskId)
        if (task) {
            this.#logger.debug(`Manually running task ${taskId}...`)
            try {
                const result = await task.executeFn(task.params)
                this.#logger.debug(`Manual run of task ${taskId} completed.`)
                return result
            } catch (error) {
                this.#logger.error(`Error during manual run of task ${taskId}:`, error)
                throw error
            }
        }
        this.#logger.warn(`Attempted to manually run non-existent task: ${taskId}`)
    }

    /**
     * Отримує конфігурацію задачі.
     * @public
     * @param {string} taskId - Ідентифікатор задачі.
     * @returns {TaskConfig|undefined}
     */
    getTaskConfig(taskId) {
        return this.#tasks.get(taskId)?.config
    }

    /**
     * Перевіряє, чи активна задача.
     * @public
     * @param {string} taskId - Ідентифікатор задачі.
     * @returns {boolean}
     */
    hasTask(taskId) {
        return this.#tasks.has(taskId)
    }

    /**
     * Зупиняє всі заплановані задачі.
     * @public
     * @returns {void}
     */
    stopAllTasks() {
        this.#tasks.forEach((_, taskId) => this.stopTask(taskId))
        this.#logger.info('All scheduled tasks stopped.')
    }
}

export { TaskScheduler }
