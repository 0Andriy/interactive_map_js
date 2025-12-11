// RedisService.js
import { createClient } from 'redis'

export class RedisService {
    constructor(url, logger) {
        this.url = url
        this.logger = logger
        this.channel = 'ws_scalable_channel'
        this.publisher = null
        this.subscriber = null
        this.messageHandler = () => {}
    }

    async connect(handlerCallback) {
        this.messageHandler = handlerCallback
        this.publisher = createClient({ url: this.url })
        this.subscriber = createClient({ url: this.url })

        this.publisher.on('error', (err) => this.logger.error('Redis Publisher Error:', err))
        this.subscriber.on('error', (err) => this.logger.error('Redis Subscriber Error:', err))

        await Promise.all([this.publisher.connect(), this.subscriber.connect()])

        await this.subscriber.subscribe(this.channel, (message, channel) => {
            // this.logger.info(`Received from Redis channel ${channel}`);
            this.messageHandler(message)
        })
        this.logger.info('Redis clients connected and subscribed.')
    }

    publish(message) {
        this.publisher.publish(this.channel, message)
    }
}
