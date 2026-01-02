/**
 * @typedef {'memory' | 'redis'} SchedulerType
 */

/**
 * @typedef {object} SchedulerFactoryOptions
 * @property {SchedulerType} type - Тип адаптера.
 * @property {object} logger - Екземпляр логера.
 * @property {import('ioredis').Redis} [redis] - Екземпляр Redis (обов'язковий для типу 'redis').
 */

import { MemorySchedulerAdapter } from '../adapters/scheduler/MemorySchedulerAdapter.js'
import { RedisSchedulerAdapter } from '../adapters/scheduler/RedisSchedulerAdapter.js'

/**
 * Фабрика для створення адаптерів планувальника.
 */
export class SchedulerFactory {
    /**
     * Створює екземпляр планувальника на основі конфігурації.
     *
     * @param {SchedulerFactoryOptions} options - Параметри ініціалізації.
     * @returns {import('../../interfaces/ISchedulerAdapter.js').ISchedulerAdapter}
     * @throws {Error} Якщо тип не підтримується або відсутні необхідні залежності.
     *
     * @example
     * const scheduler = SchedulerFactory.create({
     *   type: 'redis',
     *   logger: console,
     *   redis: new Redis()
     * });
     */
    static create(type, options) {
        if (!options.logger) {
            throw new Error('SchedulerFactory: Logger is required')
        }

        switch (type) {
            case 'memory':
                return new MemorySchedulerAdapter(options.logger)

            // case 'redis':
            //     if (!redis) {
            //         throw new Error('SchedulerFactory: Redis instance is required for "redis" type')
            //     }
            //     return new RedisSchedulerAdapter(redis, logger)

            default:
                throw new Error(`SchedulerFactory: Unknown scheduler type "${type}"`)
        }
    }
}
