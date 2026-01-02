/**
 * @typedef {'memory' | 'redis'} StateType
 */

/**
 * @typedef {object} StateConfig
 * @property {string} [url] - URL для підключення до Redis (обов'язково для 'redis').
 * @property {string} serverId - Унікальний ID поточного вузла сервера в кластері.
 * @property {import('ioredis').Redis} [redisInstance] - Можна передати вже існуючий клієнт.
 */

import { MemoryStateAdapter } from '../adapters/state/MemoryStateAdapter.js'
import { RedisStateAdapter } from '../adapters/state/RedisStateAdapter.js'
// import Redis from 'ioredis'

/**
 * Фабрика для створення адаптерів керування розподіленим станом кластера.
 */
export class StateFactory {
    /**
     * Створює екземпляр адаптера стану.
     *
     * @param {StateType} type - Тип сховища ('memory' або 'redis').
     * @param {StateConfig} config - Конфігурація адаптера.
     * @returns {import('../../interfaces/IStateAdapter.js').IStateAdapter}
     * @throws {Error} Якщо конфігурація некоректна.
     */
    static create(type, config) {
        switch (type) {
            case 'memory':
                return new MemoryStateAdapter()

            case 'redis':
                const client = config.redisInstance || new Redis(config.url)

                if (!config.url && !config.redisInstance) {
                    throw new Error(
                        'StateFactory: Redis URL or redisInstance is required for "redis" type.',
                    )
                }

                return new RedisStateAdapter(client, config.serverId)

            default:
                throw new Error(`StateFactory: Unknown state type "${type}".`)
        }
    }
}
