/**
 * @file Factory for creating Broker Adapters.
 * @module factories/BrokerFactory
 */

import { MemoryBrokerAdapter } from '../adapters/broker/MemoryBrokerAdapter.js'
import { RedisBrokerAdapter } from '../adapters/broker/RedisBrokerAdapter.js'

/**
 * @typedef {import('../interfaces/BrokerAdapter.js').BrokerAdapter} BrokerAdapter
 */

/**
 * @class BrokerFactory
 * @classdesc Фабрика для створення адаптерів брокера. Відповідає за ініціалізацію
 * транспортних клієнтів (напр. Redis) та повернення уніфікованого інтерфейсу.
 */
export class BrokerFactory {
    /**
     * Створює екземпляр адаптера брокера.
     *
     * @param {Object} config - Конфігурація брокера.
     * @param {'redis'|'memory'} config.driver - Тип брокера.
     * @param {Object} [config.options] - Опції підключення (для Redis: host, port, db тощо).
     * @param {Object} logger - Системний логер.
     * @returns {Promise<BrokerAdapter>}
     * @throws {Error} Якщо драйвер не підтримується або виникла помилка підключення.
     */
    static async create(config, logger) {
        const { driver, options } = config
        const factoryLogger = logger.child ? logger.child({ module: 'BrokerFactory' }) : logger

        factoryLogger.info(`Configuring broker transport: ${driver}`)

        switch (driver?.toLowerCase()) {
            case 'redis': {
                /**
                 * В 2026 році ми використовуємо динамічний імпорт для ioredis,
                 * щоб не навантажувати пам'ять, якщо використовується memory-драйвер.
                 */
                const { default: Redis } = await import('ioredis')

                factoryLogger.debug('Creating dedicated Redis Pub/Sub clients...')

                const pubClient = new Redis(options)
                const subClient = new Redis(options)

                // Очікуємо готовності обох клієнтів (стандарт надійності)
                await Promise.all([
                    new Promise((res, rej) => {
                        pubClient.once('ready', res)
                        pubClient.once('error', rej)
                    }),
                    new Promise((res, rej) => {
                        subClient.once('ready', res)
                        subClient.once('error', rej)
                    }),
                ])

                return new RedisBrokerAdapter(pubClient, subClient, logger)
            }

            case 'memory':
                return new MemoryBrokerAdapter(logger)

            default:
                factoryLogger.error(`Unknown broker driver: ${driver}`)
                throw new Error(
                    `Broker driver "${driver}" is not supported. Supported: "redis", "memory".`,
                )
        }
    }
}
