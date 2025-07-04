import { createClient } from 'redis'

/**
 * Клас для керування Redis-з'єднаннями та Pub/Sub.
 */
class RedisClient {
    constructor(redisUrl) {
        this.publisher = createClient({ url: redisUrl })
        this.subscriber = this.publisher.duplicate()

        this.publisher.on('error', (err) => console.error('Redis Publisher Error:', err))
        this.subscriber.on('error', (err) => console.error('Redis Subscriber Error:', err))
    }

    async connect() {
        await Promise.all([this.publisher.connect(), this.subscriber.connect()])
        console.log('Connected to Redis')
    }

    async publish(channel, message) {
        await this.publisher.publish(channel, message)
    }

    subscribe(channel, callback) {
        this.subscriber.subscribe(channel, callback)
    }
}

export default RedisClient
