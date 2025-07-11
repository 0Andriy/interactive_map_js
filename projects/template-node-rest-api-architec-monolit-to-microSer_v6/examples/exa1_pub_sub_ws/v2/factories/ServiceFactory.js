import { ILogger } from '../interfaces/ILogger.js'
import { IPubSub } from '../interfaces/IPubSub.js'
import { IStorage } from '../interfaces/IStorage.js'

import { InMemoryPubSub } from '../adapters/InMemoryPubSub.js'
import { InMemoryStorage } from '../adapters/InMemoryStorage.js'
import { RedisPubSub } from '../adapters/RedisPubSub.js'
import { RedisStorage } from '../adapters/RedisStorage.js'

import { LeaderElection } from '../services/LeaderElection.js' // Новий імпорт
import { v4 as uuidv4 } from 'uuid' // Для генерації ID інстанса

/**
 * @class ServiceFactory
 * @description Фабрика для надання реалізацій Pub/Sub та Storage
 * на основі конфігурації.
 */
class ServiceFactory {
    #logger
    #config
    #instances = {
        pubSub: null,
        storage: null,
        leaderElection: null, // Додаємо leaderElection
    }
    #instanceId // Унікальний ID цього інстанса

    /**
     * @param {ILogger} logger - Екземпляр логера.
     * @param {object} config - Конфігурація для сервісів.
     * @param {string} config.mode - 'monolithic' або 'distributed'.
     * @param {object} [config.redis] - Конфігурація Redis для розподіленого режиму.
     */
    constructor(logger, config) {
        this.#logger = logger
        this.#config = config
        this.#instanceId = uuidv4() // Генеруємо унікальний ID для цього інстанса
        this.#logger.log(`ServiceFactory initialized in '${config.mode}' mode.`)
    }

    /**
     * Отримує екземпляр IPubSub.
     * @returns {IPubSub}
     */
    getPubSub() {
        if (!this.#instances.pubSub) {
            if (this.#config.mode === 'monolithic') {
                this.#instances.pubSub = new InMemoryPubSub(this.#logger)
            } else if (this.#config.mode === 'distributed') {
                if (!this.#config.redis) {
                    throw new Error("Redis configuration is required for 'distributed' mode.")
                }
                this.#instances.pubSub = new RedisPubSub(this.#config.redis, this.#logger)
            } else {
                throw new Error(`Unknown mode: ${this.#config.mode}`)
            }
        }
        return this.#instances.pubSub
    }

    /**
     * Отримує екземпляр IStorage.
     * @returns {IStorage}
     */
    getStorage() {
        if (!this.#instances.storage) {
            if (this.#config.mode === 'monolithic') {
                this.#instances.storage = new InMemoryStorage(this.#logger)
            } else if (this.#config.mode === 'distributed') {
                if (!this.#config.redis) {
                    throw new Error("Redis configuration is required for 'distributed' mode.")
                }
                this.#instances.storage = new RedisStorage(this.#config.redis, this.#logger)
            } else {
                throw new Error(`Unknown mode: ${this.#config.mode}`)
            }
        }
        return this.#instances.storage
    }

    /**
     * Отримує екземпляр LeaderElection.
     * @returns {LeaderElection|null}
     */
    getLeaderElection() {
        if (this.#config.mode !== 'distributed') {
            return null // LeaderElection потрібен тільки в розподіленому режимі
        }
        if (!this.#instances.leaderElection) {
            if (!this.#config.redis) {
                throw new Error(
                    "Redis configuration is required for 'distributed' mode to use LeaderElection.",
                )
            }
            // Створюємо LeaderElection, використовуючи RedisStorage
            this.#instances.leaderElection = new LeaderElection(
                this.getStorage(), // Отримуємо вже налаштований RedisStorage
                this.#logger,
                this.#instanceId,
                this.#config.leaderKey || 'global_server_leader', // Можна налаштувати ключ
                this.#config.leaderTtlMs || 10000,
                this.#config.leaderRenewalIntervalMs || 3000,
            )
        }
        return this.#instances.leaderElection
    }

    /**
     * Підключає всі необхідні сервіси.
     */
    async connectAll() {
        const pubSub = this.#instances.pubSub || this.getPubSub()
        const storage = this.#instances.storage || this.getStorage()
        const leaderElection = this.#instances.leaderElection || this.getLeaderElection()

        if (pubSub.connect) {
            await pubSub.connect()
        }
        if (storage.connect) {
            await storage.connect()
        }
        if (leaderElection) {
            await leaderElection.start()
        }
        this.#logger.log('All services connected.')
    }

    /**
     * Закриває всі сервіси.
     */
    async closeAll() {
        if (this.#instances.leaderElection) {
            await this.#instances.leaderElection.stop()
            this.#instances.leaderElection = null
        }
        if (this.#instances.pubSub) {
            await this.#instances.pubSub.close()
            this.#instances.pubSub = null
        }
        if (this.#instances.storage) {
            await this.#instances.storage.close()
            this.#instances.storage = null
        }
        this.#logger.log('All services closed.')
    }
}

export { ServiceFactory }
