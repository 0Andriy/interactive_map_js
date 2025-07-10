// src/storage/StorageFactory.js

import { InMemoryStateStorage } from './InMemoryStateStorage.js'
import { RedisStateStorage } from './RedisStateStorage.js' // Ваша заглушка або реальна реалізація
import { IStateStorage } from './IStateStorage.js'

/**
 * Фабрика для створення екземплярів сховища стану.
 * Дозволяє легко перемикатися між In-Memory та Redis реалізаціями.
 */
class StorageFactory {
    /**
     * @param {object} config - Об'єкт конфігурації.
     * @param {string} config.type - Тип сховища ('in-memory' або 'redis').
     * @param {object} [config.redis] - Конфігурація для Redis, якщо type 'redis'.
     * @param {object} [logger=console] - Екземпляр логера.
     * @returns {IStateStorage} Екземпляр сховища стану.
     */
    static createStorage(config, logger = console) {
        if (!config || !config.type) {
            logger.warn(
                'Тип сховища не вказано в конфігурації. Використовується In-Memory за замовчуванням.',
            )
            return new InMemoryStateStorage(logger)
        }

        switch (config.type.toLowerCase()) {
            case 'in-memory':
                logger.info('Створено In-Memory State Storage.')
                return new InMemoryStateStorage(logger)
            case 'redis':
                logger.info('Створено Redis State Storage (ПОТРІБНА РЕАЛІЗАЦІЯ).')
                return new RedisStateStorage(config.redis, logger) // Передати конфігурацію Redis
            default:
                logger.warn(
                    `Невідомий тип сховища: ${config.type}. Використовується In-Memory за замовчуванням.`,
                )
                return new InMemoryStateStorage(logger)
        }
    }
}

export { StorageFactory }
