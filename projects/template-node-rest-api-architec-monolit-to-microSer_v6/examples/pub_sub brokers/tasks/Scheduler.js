// src/tasks/Scheduler.js

/**
 * @typedef {object} TaskDefinition
 * @property {string} name - Унікальне ім'я завдання.
 * @property {function(object, object, import('../brokers/MessageBroker.js').default): Promise<any>} execute - Асинхронна функція, що виконує логіку завдання. Приймає аргументи, логер і брокер.
 * @property {number} intervalMs - Інтервал виконання в мілісекундах.
 * @property {boolean} [runImmediately=false] - Чи запускати завдання відразу після реєстрації.
 * @property {object} [initialArgs={}] - Початкові аргументи, які будуть передані в execute при першому запуску.
 */

/**
 * @class Scheduler
 * @description Відповідає за планування та виконання періодичних завдань.
 */
class Scheduler {
    /**
     * @param {import('../brokers/MessageBroker.js').default} broker - Екземпляр брокера повідомлень.
     * @param {object} logger - Екземпляр логера.
     */
    constructor(broker, logger) {
        if (!broker) {
            throw new Error('MessageBroker instance is required for Scheduler.')
        }
        if (!logger || typeof logger.info !== 'function') {
            throw new Error('Logger instance is required for Scheduler.')
        }

        this.broker = broker
        this.logger = logger
        /**
         * @private
         * @type {Map<string, { definition: TaskDefinition, intervalId: NodeJS.Timeout | null }>}
         * @description Зберігає зареєстровані завдання та їх ідентифікатори інтервалів.
         */
        this.tasks = new Map()
        this.logger.info('Scheduler initialized.')
    }

    /**
     * @method registerTask
     * @description Реєструє періодичне завдання для виконання.
     * @param {TaskDefinition} taskDef - Визначення завдання.
     * @returns {void}
     * @throws {Error} Якщо завдання з таким ім'ям вже зареєстроване.
     */
    registerTask(taskDef) {
        if (this.tasks.has(taskDef.name)) {
            throw new Error(`Task with name '${taskDef.name}' is already registered.`)
        }
        if (typeof taskDef.execute !== 'function') {
            throw new Error(`Task '${taskDef.name}' must have an 'execute' function.`)
        }
        if (typeof taskDef.intervalMs !== 'number' || taskDef.intervalMs <= 0) {
            throw new Error(`Task '${taskDef.name}' must have a positive 'intervalMs'.`)
        }

        this.tasks.set(taskDef.name, {
            definition: taskDef,
            intervalId: null,
        })
        this.logger.info(`Task '${taskDef.name}' registered with interval ${taskDef.intervalMs}ms.`)
    }

    /**
     * @method startTask
     * @description Запускає виконання конкретного зареєстрованого завдання.
     * @param {string} taskName - Ім'я завдання для запуску.
     * @returns {void}
     * @throws {Error} Якщо завдання не знайдено.
     */
    startTask(taskName) {
        const taskEntry = this.tasks.get(taskName)
        if (!taskEntry) {
            throw new Error(`Task '${taskName}' not found.`)
        }
        if (taskEntry.intervalId) {
            this.logger.warn(`Task '${taskName}' is already running.`)
            return
        }

        const { definition } = taskEntry

        const executeTask = async (args) => {
            try {
                const result = await definition.execute(args, this.logger, this.broker)
                this.logger.debug(`Task '${taskName}' executed successfully. Result:`, result)
                return result
            } catch (error) {
                this.logger.error(`Task '${taskName}' failed to execute:`, error)
                throw error
            }
        }

        if (definition.runImmediately) {
            this.logger.info(`Task '${taskName}' executing immediately.`)
            executeTask(definition.initialArgs || {})
        }

        const intervalId = setInterval(() => {
            this.logger.debug(`Scheduling next run for task '${taskName}'.`)
            executeTask({})
        }, definition.intervalMs)

        taskEntry.intervalId = intervalId
        this.logger.info(`Task '${taskName}' started. Next run in ${definition.intervalMs}ms.`)
    }

    /**
     * @method stopTask
     * @description Зупиняє виконання конкретного зареєстрованого завдання.
     * @param {string} taskName - Ім'я завдання для зупинки.
     * @returns {void}
     */
    stopTask(taskName) {
        const taskEntry = this.tasks.get(taskName)
        if (taskEntry && taskEntry.intervalId) {
            clearInterval(taskEntry.intervalId)
            taskEntry.intervalId = null
            this.logger.info(`Task '${taskName}' stopped.`)
        } else {
            this.logger.warn(`Task '${taskName}' is not running or not found.`)
        }
    }

    /**
     * @method removeTask
     * @description Зупиняє та повністю видаляє завдання з планувальника.
     * @param {string} taskName - Ім'я завдання для видалення.
     * @returns {boolean} True, якщо завдання було видалено, false, якщо не знайдено.
     */
    removeTask(taskName) {
        const taskEntry = this.tasks.get(taskName)
        if (taskEntry) {
            if (taskEntry.intervalId) {
                clearInterval(taskEntry.intervalId) // Зупиняємо, якщо запущено
                this.logger.info(`Task '${taskName}' was running and has been stopped.`)
            }
            this.tasks.delete(taskName)
            this.logger.info(`Task '${taskName}' has been removed from the scheduler.`)
            return true
        } else {
            this.logger.warn(`Attempted to remove non-existent task '${taskName}'.`)
            return false
        }
    }

    /**
     * @method startAllTasks
     * @description Запускає всі зареєстровані завдання.
     * @returns {void}
     */
    startAllTasks() {
        this.logger.info('Starting all registered tasks...')
        this.tasks.forEach((_, taskName) => {
            try {
                this.startTask(taskName)
            } catch (error) {
                this.logger.error(`Failed to start task '${taskName}':`, error)
            }
        })
        this.logger.info('All tasks started.')
    }

    /**
     * @method stopAllTasks
     * @description Зупиняє всі запущені завдання.
     * @returns {void}
     */
    stopAllTasks() {
        this.logger.info('Stopping all running tasks...')
        this.tasks.forEach((_, taskName) => {
            this.stopTask(taskName)
        })
        this.logger.info('All tasks stopped.')
    }
}

export default Scheduler
