/**
 * @typedef {Object} TaskConfig
 * @property {number} [intervalMs=60000] - Інтервал між запусками у мілісекундах.
 * @property {boolean} [runOnActivation=false] - Чи запускати задачу негайно при реєстрації.
 * @property {() => boolean} [condition] - Опціональна функція-умова. Якщо повертає false, задача зупиняється.
 */

/**
 * Універсальний відказостійкий планувальник задач.
 * Забезпечує виконання без накладання (drift-free) та коректне завершення (Graceful Shutdown).
 *
 * @example
 * // 1. Базове використання
 * const scheduler = new Scheduler(logger);
 * scheduler.schedule('sync-task', async () => {
 *   await db.sync();
 * }, { intervalMs: 5000 });
 *
 * @example
 * // 2. Використання з умовою (зупиниться, коли черга порожня)
 * scheduler.schedule('cleanup', processQueue, {
 *   intervalMs: 10000,
 *   condition: () => queue.length > 0
 * });
 *
 * @example
 * // 3. Інтеграція з Distributed Lock (Redis)
 * const lockedTask = withDistributedLock('unique-id', taskFn);
 * scheduler.schedule('locked-task', lockedTask, { intervalMs: 60000 });
 *
 * @example
 * // 4. Graceful Shutdown (завершення роботи сервісу)
 * process.on('SIGTERM', async () => {
 *   await scheduler.stopAll();
 *   process.exit(0);
 * });
 */
export class Scheduler {
    /**
     * @param {Object} [logger] - Об'єкт логера
     */
    constructor(logger = null) {
        /** @private @type {Map<string, Object>} */
        this.tasks = new Map()

        /** @private */
        this.defaultConfig = {
            intervalMs: 1000 * 60,
            runOnActivation: false,
        }

        /** @private */
        this.logger = logger?.child?.({ component: 'Scheduler' }) ?? logger

        this.logger?.info?.(`Scheduler initialized`)
    }

    /**
     * Планує задачу для циклічного виконання.
     *
     * @param {string} taskId - Унікальний ідентифікатор задачі.
     * @param {() => Promise<void> | void} executeFn - Функція, що буде виконуватися.
     * @param {TaskConfig} [config={}] - Налаштування задачі.
     * @returns {Promise<void>}
     */
    async schedule(taskId, executeFn, config = {}) {
        if (this.tasks.has(taskId)) {
            this.logger?.warn?.(`Task ${taskId} is already scheduled.`)
            return
        }

        const finalConfig = {
            ...this.defaultConfig,
            ...config,
        }

        const taskData = {
            active: true,
            timerId: null,
            executeFn: executeFn,
            config: finalConfig,
            //
            currentPromise: null,
            condition: config.condition || null,
        }

        this.tasks.set(taskId, taskData)

        /**
         * Внутрішня обгортка для керування циклом виконання.
         */
        const taskWrapper = async () => {
            if (!taskData.active) return

            // Перевірка умови продовження (Dynamic check)
            if (taskData.condition && !taskData.condition()) {
                this.logger?.info?.(`Condition not met for ${taskId}. Stopping.`)
                return this.stop(taskId)
            }

            try {
                this.logger?.debug?.(`Executing task: ${taskId}`)

                // Відстежуємо проміс для Graceful Shutdown
                taskData.currentPromise = executeFn()
                await taskData.currentPromise
            } catch (error) {
                this.logger?.error?.(`Task ${taskId} execution failed:`, error)
            } finally {
                taskData.currentPromise = null
            }

            // ПЛАНУВАННЯ НАСТУПНОГО ЗАПУСКУ (Drift-free recursive timeout)
            // Виконується тільки ПІСЛЯ завершення попередньої ітерації
            if (taskData.active && finalConfig.intervalMs > 0) {
                // Очищуємо старий таймер про всяк випадок перед створенням нового
                if (taskData.timerId) {
                    clearTimeout(taskData.timerId)
                }
                taskData.timerId = setTimeout(taskWrapper, finalConfig.intervalMs)
            }
        }

        if (finalConfig.runOnActivation) {
            this.logger?.debug?.(`Immediate activation for task: ${taskId}`)
            // Запуск без await, щоб метод schedule повернув керування негайно
            taskWrapper()
        } else if (finalConfig.intervalMs > 0) {
            taskData.timerId = setTimeout(taskWrapper, finalConfig.intervalMs)
        }

        this.logger?.info?.(`Task ${taskId} successfully scheduled.`)
    }

    /**
     * Перевіряє, чи задача з таким ID зареєстрована.
     *
     * @param {string} taskId
     * @returns {boolean}
     */
    has(taskId) {
        return this.tasks.has(taskId)
    }

    /**
     * Повертає поточний статус задачі.
     *
     * @param {string} taskId
     * @returns {{ exists: boolean, isRunning: boolean } | null}
     */
    getTaskStatus(taskId) {
        const task = this.tasks.get(taskId)
        if (!task) return null

        return {
            exists: true,
            isRunning: !!task.currentPromise,
        }
    }

    /**
     * Зупиняє конкретну задачу, скасовує майбутні таймери та чекає на завершення активного виконання.
     *
     * @param {string} taskId - ID задачі.
     * @returns {Promise<void>}
     */
    async stop(taskId) {
        const task = this.tasks.get(taskId)
        if (!task) {
            this.logger?.debug?.(`Attempted to stop non-existent task: ${taskId}`)
            return
        }

        task.active = false
        if (task.timerId) {
            clearTimeout(task.timerId)
            task.timerId = null
        }

        // Чекаємо, якщо функція виконується в даний момент
        if (task.currentPromise) {
            await task.currentPromise
        }

        this.tasks.delete(taskId)
        this.logger?.debug?.(`Task ${taskId} has been stopped.`)
    }

    /**
     * Зупиняє всі зареєстровані задачі паралельно.
     * Гарантує, що всі асинхронні процеси завершені перед поверненням результату.
     *
     * @returns {Promise<void>}
     */
    async stopAll() {
        const activeIds = Array.from(this.tasks.keys())
        for (const id of activeIds) {
            await this.stop(id)
        }
        this.logger?.info?.(`All tasks (${activeIds.length}) have been cleared.`)
    }
}
