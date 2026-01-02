/**
 * @typedef {'memory' | 'redis' | 'rabbitmq'} BrokerType
 */

/**
 * @typedef {object} RedisConfig
 * @property {string} url - URL підключення до Redis.
 */

import { MemoryBrokerAdapter } from '../adapters/broker/MemoryBrokerAdapter.js'
import { RedisBrokerAdapter } from '../adapters/broker/RedisBrokerAdapter.js'
// Припустимо, що у вас встановлено ioredis для роботи з Redis
// import Redis from 'ioredis'

/**
 * Фабрика для створення адаптерів брокера повідомлень (Pub/Sub).
 */
export class BrokerFactory {
    /**
     * Створює екземпляр адаптера брокера.
     *
     * @param {BrokerType} type - Тип брокера ('memory', 'redis', 'rabbitmq').
     * @param {RedisConfig|object} config - Об'єкт конфігурації.
     * @returns {import('../../interfaces/IBrokerAdapter.js').IBrokerAdapter}
     * @throws {Error} Якщо тип не підтримується або конфігурація неповна.
     */
    static create(type, config) {
        switch (type) {
            case 'memory':
                // MemoryBrokerAdapter не потребує конфігурації
                return new MemoryBrokerAdapter()

            case 'redis':
                if (!config || !config.url) {
                    throw new Error('BrokerFactory: Redis URL is required in config.')
                }
                // Для Redis Pub/Sub потрібно два клієнти: один для підписки, інший для публікації.
                const subscriberClient = new Redis(config.url)
                const publisherClient = new Redis(config.url)
                return new RedisBrokerAdapter(publisherClient, subscriberClient)

            // case 'rabbitmq':
            //     // Тут буде логіка для створення RabbitMQBrokerAdapter
            //     throw new Error('BrokerFactory: RabbitMQ adapter not implemented yet.');

            default:
                throw new Error(`BrokerFactory: Unknown broker type "${type}".`)
        }
    }
}
