// adapters/BrokerAdapter.js
export class RedisBrokerAdapter {
    constructor(pubClient, subClient, logger) {
        this.pub = pubClient
        this.sub = subClient
        this.logger = logger.child('BrokerAdapter')
        this.callbacks = new Map()

        this._init()
    }

    _init() {
        this.sub.on('pmessage', (pattern, channel, message) => {
            try {
                const data = JSON.parse(message)
                const callback = this.callbacks.get(pattern)
                if (callback) callback(data)
            } catch (err) {
                this.logger.error('Failed to parse broker message', err)
            }
        })
    }

    async publish(topic, data) {
        try {
            await this.pub.publish(topic, JSON.stringify(data))
        } catch (err) {
            this.logger.error(`Publish error on ${topic}`, err)
        }
    }

    async subscribe(pattern, callback) {
        try {
            if (!this.callbacks.has(pattern)) {
                await this.sub.psubscribe(pattern)
                this.callbacks.set(pattern, callback)
            }
            this.logger.info(`Subscribed to ${pattern}`)
        } catch (err) {
            this.logger.error(`Subscribe error on ${pattern}`, err)
        }
    }
}
