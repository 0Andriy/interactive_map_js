import { v4 as uuidv4 } from 'uuid' // Для унікальних ID задач

/**
 * @class TaskScheduler
 * @description Управляє періодичними задачами.
 */
class TaskScheduler {
    #tasks = new Map() // Map<taskId, { intervalId, config, executeFn }>
    #logger

    constructor(logger) {
        this.#logger = logger
    }

    /**
     * Планує нову періодичну задачу.
     * @param {string} taskId - Унікальний ідентифікатор задачі (примітивний ключ).
     * @param {object} config - Конфігурація задачі.
     * @param {number} config.intervalMs - Інтервал виконання в мілісекундах.
     * @param {boolean} [config.runOnActivation=false] - Чи запускати задачу негайно при активації.
     * @param {function(any): any} executeFn - Функція, яка буде виконуватися. Приймає параметри, повертає результат.
     * @param {object} [params={}] - Параметри, які будуть передані в executeFn.
     */
    scheduleTask(taskId, config, executeFn, params = {}) {
        if (this.#tasks.has(taskId)) {
            this.#logger.warn(`Task with ID ${taskId} already scheduled. Stopping existing one.`)
            this.stopTask(taskId)
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

        const intervalId = setInterval(taskWrapper, config.intervalMs)
        this.#tasks.set(taskId, { intervalId, config, executeFn, params })

        if (config.runOnActivation) {
            this.#logger.debug(`Running task ${taskId} immediately on activation.`)
            taskWrapper()
        }

        this.#logger.log(`Task ${taskId} scheduled with interval ${config.intervalMs}ms.`)
    }

    /**
     * Зупиняє заплановану задачу.
     * @param {string} taskId - Ідентифікатор задачі.
     */
    stopTask(taskId) {
        const task = this.#tasks.get(taskId)
        if (task) {
            clearInterval(task.intervalId)
            this.#tasks.delete(taskId)
            this.#logger.log(`Task ${taskId} stopped and unscheduled.`)
        } else {
            this.#logger.warn(`Attempted to stop non-existent task: ${taskId}`)
        }
    }

    /**
     * Отримує конфігурацію задачі.
     * @param {string} taskId - Ідентифікатор задачі.
     * @returns {object|undefined} Конфігурація задачі або undefined, якщо її немає.
     */
    getTaskConfig(taskId) {
        return this.#tasks.get(taskId)?.config
    }

    /**
     * Перевіряє, чи активна задача.
     * @param {string} taskId - Ідентифікатор задачі.
     * @returns {boolean} True, якщо задача активна.
     */
    hasTask(taskId) {
        return this.#tasks.has(taskId)
    }

    /**
     * Зупиняє всі задачі.
     */
    stopAllTasks() {
        this.#tasks.forEach((_, taskId) => this.stopTask(taskId))
        this.#logger.log('All scheduled tasks stopped.')
    }
}

export { TaskScheduler }
