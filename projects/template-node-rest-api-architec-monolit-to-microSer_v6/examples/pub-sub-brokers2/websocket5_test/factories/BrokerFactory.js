import { MemoryBrokerAdapter } from '../adapters/broker/MemoryBrokerAdapter.js'
import { RedisBrokerAdapter } from '../adapters/broker/RedisBrokerAdapter.js'
// import Redis from 'ioredis'

export class BrokerFactory {
    /**
     * @param {string} type
     * @param {object} config
     */
    static create(type, config) {
        // if (type === 'redis') {
        //     return new RedisBrokerAdapter(new Redis(config.url), new Redis(config.url))
        // }
        // Тут можна додати RabbitMQBrokerAdapter
        return new MemoryBrokerAdapter()
    }
}
