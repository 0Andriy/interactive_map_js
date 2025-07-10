// src/BrokerProvider.js
import { InMemoryBroker, RedisBroker } from './brokers/index.js'
// import { RabbitMQBroker } from './brokers/index.js'; // Розкоментуйте, коли реалізуєте

/**
 * @class BrokerProvider
 * @description Фабрика для створення екземплярів брокерів повідомлень на основі конфігурації.
 */
class BrokerProvider {
    /**
     * @static
     * @method getBroker
     * @param {string} brokerType - Тип брокера, який потрібно отримати (наприклад, 'in-memory', 'redis', 'rabbitmq').
     * @param {object} config - Об'єкт конфігурації, що містить специфічні налаштування для брокера.
     * @param {object} logger - Екземпляр логера для передачі брокеру.
     * @returns {import('./brokers/MessageBroker.js').default} Екземпляр брокера повідомлень.
     * @throws {Error} Якщо вказано невідомий тип брокера або відсутні необхідні налаштування.
     */
    static getBroker(brokerType, config, logger = console) {
        switch (brokerType) {
            case 'in-memory':
                return new InMemoryBroker(logger)
            // Коли будете додавати RedisBroker або RabbitMQBroker, розкоментуйте відповідні блоки:
            case 'redis':
                if (!config.redis) {
                    throw new Error('Redis configuration is missing for RedisBroker.')
                }
                return new RedisBroker(config.redis, logger)
            // case 'rabbitmq':
            //     if (!config.rabbitmq) {
            //         throw new Error("RabbitMQ configuration is missing for RabbitMQBroker.");
            //     }
            //     return new RabbitMQBroker(config.rabbitmq, logger);
            default:
                throw new Error(`Unknown broker type specified: "${brokerType}".`)
        }
    }
}

export default BrokerProvider
