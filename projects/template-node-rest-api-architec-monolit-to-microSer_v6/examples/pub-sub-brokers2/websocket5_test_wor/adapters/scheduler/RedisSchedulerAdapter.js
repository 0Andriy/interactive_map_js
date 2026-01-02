import { ISchedulerAdapter } from '../../interfaces/ISchedulerAdapter.js'

/**
 * @typedef {object} TaskConfig
 * @property {number} [intervalMs=60000] - Інтервал виконання.
 * @property {boolean} [runOnActivation=false] - Запуск при активації.
 * @property {number} [lockDurationMs] - Тривалість блокування (за замовчуванням дорівнює intervalMs).
 */

/**
 * Адаптер планувальника на базі Redis для роботи в кластері.
 * @extends {ISchedulerAdapter}
 */
export class RedisSchedulerAdapter extends ISchedulerAdapter {
    /** @type {Map<string, ReturnType<typeof setTimeout>>} */
    #localTimers = new Map()

    /** @type {import('ioredis').Redis} */
    #redis

    /** @type {object} */
    #logger

    /**
     * @param {import('ioredis').Redis} redis - Екземпляр ioredis.
     * @param {object} logger - Логер.
     */
    constructor(redis, logger) {
        super()
        this.#redis = redis
        this.#logger = logger
    }

    /**
     * Планує задачу з розподіленим блокуванням.
     * @param {string} taskId
     * @param {() => Promise<void> | void} executeFn
     * @param {Partial<TaskConfig>} [config={}]
     */
    async schedule(taskId, executeFn, config = {}) {
        await this.stop(taskId)

        const intervalMs = config.intervalMs || 60000
        const lockDurationMs = config.lockDurationMs || intervalMs
        const lockKey = `lock:sched:${taskId}`

        const taskWrapper = async () => {
            try {
                // Атомарна спроба захопити блокування в Redis (SET if Not Exists)
                // "PX" встановлює час життя ключа в мілісекундах
                const lockAcquired = await this.#redis.set(
                    lockKey,
                    'locked',
                    'PX',
                    lockDurationMs,
                    'NX',
                )

                if (lockAcquired) {
                    this.#logger?.trace(`[Cluster] Node acquired lock for task: ${taskId}`)
                    await executeFn()
                } else {
                    this.#logger?.trace(
                        `[Cluster] Task ${taskId} is being executed by another node.`,
                    )
                }
            } catch (error) {
                this.#logger?.error(`Redis Task ${taskId} failed:`, error)
            } finally {
                // Плануємо наступну перевірку локально на кожному вузлі
                const timer = setTimeout(taskWrapper, intervalMs)
                this.#localTimers.set(taskId, timer)
            }
        }

        if (config.runOnActivation) {
            taskWrapper()
        } else {
            const timer = setTimeout(taskWrapper, intervalMs)
            this.#localTimers.set(taskId, timer)
        }

        this.#logger?.info(`Redis-task ${taskId} scheduled (Cluster mode).`)
    }

    /**
     * Зупиняє локальний таймер та видаляє блокування (опціонально).
     * @param {string} taskId
     */
    async stop(taskId) {
        const timer = this.#localTimers.get(taskId)
        if (timer) {
            clearTimeout(timer)
            this.#localTimers.delete(taskId)
        }
        // Ми не видаляємо ключ із Redis, щоб інші вузли не підхопили задачу миттєво
    }

    /**
     * Зупиняє всі задачі на цьому вузлі.
     */
    async stopAll() {
        for (const taskId of this.#localTimers.keys()) {
            await this.stop(taskId)
        }
        this.#logger?.info('All Redis-tasks stopped on this node.')
    }
}
