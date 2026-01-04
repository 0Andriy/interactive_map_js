/**
 * @file Factory for creating State Adapters based on environment configuration.
 * @module factories/StateFactory
 */

import { MemoryStateAdapter } from '../adapters/state/MemoryStateAdapter.js'
import { RedisStateAdapter } from '../adapters/state/RedisStateAdapter.js'

/**
 * @typedef {import('../interfaces/StateAdapter.js').StateAdapter} StateAdapter
 */

/**
 * @class StateFactory
 * @classdesc Фабрика для ініціалізації відповідного адаптера стану (Redis або Memory).
 */
export class StateFactory {
    /**
     * Створює екземпляр адаптера стану.
     *
     * @param {Object} config - Конфігурація драйвера.
     * @param {'redis'|'memory'} config.driver - Тип драйвера.
     * @param {Object} [config.options] - Опції для Redis (host, port, password тощо).
     * @param {Object} logger - Екземпляр системного логера.
     * @returns {StateAdapter} Реалізація StateAdapter.
     * @throws {Error} Якщо вказано невідомий драйвер.
     */
    static create(config, logger) {
        const { driver, options } = config
        const factoryLogger = logger.child ? logger.child({ module: 'StateFactory' }) : logger

        factoryLogger.info(`Initializing state adapter with driver: ${driver}`)

        switch (driver?.toLowerCase()) {
            case 'redis':
                // RedisStateAdapter, який приймає клієнта або конфіг
                // Тут можна додати ініціалізацію клієнта (напр. ioredis), якщо він не переданий
                return new RedisStateAdapter(options, logger)

            case 'memory':
                return new MemoryStateAdapter(logger)

            default:
                factoryLogger.error(`Unsupported state driver: ${driver}`)
                throw new Error(
                    `State driver "${driver}" is not supported. Available: "redis", "memory".`,
                )
        }
    }
}
