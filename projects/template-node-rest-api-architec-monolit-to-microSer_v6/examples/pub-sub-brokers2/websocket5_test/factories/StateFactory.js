import { MemoryStateAdapter } from '../adapters/state/MemoryStateAdapter.js'
import { RedisStateAdapter } from '../adapters/state/RedisStateAdapter.js'
// import Redis from 'ioredis'

export class StateFactory {
    /**
     * @param {string} type
     * @param {object} config
     */
    static create(type, config) {
        // if (type === 'redis') {
        //     return new RedisStateAdapter(new Redis(config.url), config.serverId)
        // }
        return new MemoryStateAdapter()
    }
}
