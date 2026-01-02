/**
 * @typedef {import('../../interfaces/ISchedulerAdapter.js').ISchedulerAdapter} ISchedulerAdapter
 */

/**
 * @typedef {object} TaskConfig
 * @property {number} [intervalMs=60000] - Інтервал виконання в мілісекундах.
 * @property {boolean} [runOnActivation=false] - Чи запускати задачу негайно при активації.
 */

/**
 * @typedef {object} TaskData
 * @property {boolean} active - Прапорець активності задачі.
 * @property {ReturnType<typeof setTimeout>|null} timerId - Ідентифікатор таймера.
 * @property {() => Promise<void> | void} executeFn - Функція для виконання.
 * @property {TaskConfig} config - Повна конфігурація задачі.
 */

import { ISchedulerAdapter } from '../../interfaces/ISchedulerAdapter.js'

/**
 * Реалізація планувальника завдань у пам'яті.
 * @extends {ISchedulerAdapter}
 */
export class MemorySchedulerAdapter extends ISchedulerAdapter {
    /**
     * @type {Map<string, TaskData>}
     * @private
     */
    #tasks = new Map()

    /**
     * @type {ILogger|undefined}
     * @private
     */
    #logger

    /**
     * @type {TaskConfig}
     * @private
     */
    #defaultConfig

    /**
     * @param {ILogger} [logger] - Екземпляр логера.
     */
    constructor(logger) {
        super() // Обов'язково викликаємо super() при наслідуванні
        this.#logger = logger
        this.#defaultConfig = {
            intervalMs: 1000 * 60,
            runOnActivation: false,
        }
    }

    /**
     * Планує або перезапускає задачу.
     * @param {string} taskId - Унікальний ідентифікатор задачі.
     * @param {() => Promise<void> | void} executeFn - Функція, що буде виконуватися.
     * @param {Partial<TaskConfig>} [config={}] - Налаштування задачі.
     * @returns {Promise<void>}
     */
    async schedule(taskId, executeFn, config = {}) {
        // Якщо задача вже існує, коректно зупиняємо її перед перезапуском
        if (this.#tasks.has(taskId)) {
            this.#logger?.warn(`Task ${taskId} already exists. Re-scheduling...`)
            await this.stop(taskId)
        }

        /** @type {TaskConfig} */
        const finalConfig = {
            ...this.#defaultConfig,
            ...config,
        }

        /** @type {TaskData} */
        const taskData = {
            active: true,
            timerId: null,
            executeFn: executeFn,
            config: finalConfig,
        }

        this.#tasks.set(taskId, taskData)

        /**
         * Обгортка для рекурсивного виклику.
         * Використовує стрілочну функцію для збереження контексту (якщо знадобиться).
         */
        const taskWrapper = async () => {
            if (!taskData.active) return

            try {
                this.#logger?.trace(`Executing task: ${taskId}`)
                await executeFn()
            } catch (error) {
                this.#logger?.error(`Task ${taskId} execution failed:`, error)
            }

            // ПЛАНУВАННЯ НАСТУПНОГО ЗАПУСКУ (Drift-free recursive timeout)
            // Виконується тільки ПІСЛЯ завершення попередньої ітерації
            if (taskData.active && finalConfig.intervalMs > 0) {
                taskData.timerId = setTimeout(taskWrapper, finalConfig.intervalMs)
            }
        }

        if (finalConfig.runOnActivation) {
            this.#logger?.debug(`Immediate activation for task: ${taskId}`)
            // Запуск без await, щоб метод schedule повернув керування негайно
            taskWrapper()
        } else if (finalConfig.intervalMs > 0) {
            taskData.timerId = setTimeout(taskWrapper, finalConfig.intervalMs)
        }

        this.#logger?.info(`Task ${taskId} successfully scheduled.`)
    }

    /**
     * Зупиняє конкретну задачу та очищує її ресурси.
     * @param {string} taskId
     * @returns {Promise<void>}
     */
    async stop(taskId) {
        const task = this.#tasks.get(taskId)

        if (!task) {
            this.#logger?.debug(`Attempted to stop non-existent task: ${taskId}`)
            return
        }

        task.active = false
        if (task.timerId) {
            clearTimeout(task.timerId)
            task.timerId = null
        }

        this.#tasks.delete(taskId)
        this.#logger?.debug(`Task ${taskId} has been stopped.`)
    }

    /**
     * Зупиняє всі зареєстровані задачі одночасно.
     * @returns {Promise<void>}
     */
    async stopAll() {
        const activeIds = Array.from(this.#tasks.keys())
        // Використовуємо Promise.all для паралельної зупинки всіх задач
        await Promise.all(activeIds.map((id) => this.stop(id)))
        this.#logger?.info(`All tasks (${activeIds.length}) have been cleared.`)
    }
}
