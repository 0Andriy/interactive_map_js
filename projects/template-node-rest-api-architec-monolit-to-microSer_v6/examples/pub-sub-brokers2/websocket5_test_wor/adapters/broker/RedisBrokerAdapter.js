import { IBrokerAdapter } from '../../interfaces/IBrokerAdapter.js'

/**
 * @implements {IBrokerAdapter}
 */
export class RedisBrokerAdapter extends IBrokerAdapter {
    /**
     * @param {import('ioredis').Redis} pub
     * @param {import('ioredis').Redis} sub
     */
    constructor(pub, sub) {
        super()
        this.pub = pub
        this.sub = sub
        /**
         * @type {Map<string, Set<Function>>}
         */
        this.handlers = new Map()

        this.sub.on('message', (channel, message) => {
            const callbacks = this.handlers.get(channel)
            if (callbacks) {
                const data = JSON.parse(message)
                callbacks.forEach((cb) => cb(data))
            }
        })

        // Автоматичне відновлення при перепідключенні
        this.sub.on('ready', async () => {
            if (this.handlers.size > 0) {
                this.logger?.info(`Restoring ${this.handlers.size} Redis subscriptions...`)
                const topics = Array.from(this.handlers.keys())
                await this.sub.subscribe(...topics)
            }
        })
    }

    async subscribe(topic, callback) {
        if (!this.handlers.has(topic)) {
            this.handlers.set(topic, new Set())
            await this.sub.subscribe(topic)
        }
        this.handlers.get(topic).add(callback)

        // Повертаємо функцію для відписки
        return () => this.unsubscribe(topic, callback)
    }

    async unsubscribe(topic, callback) {
        const callbacks = this.handlers.get(topic)
        if (callbacks) {
            callbacks.delete(callback)
            if (callbacks.size === 0) {
                this.handlers.delete(topic)
                await this.sub.unsubscribe(topic)
            }
        }
    }

    async publish(topic, data) {
        await this.pub.publish(topic, JSON.stringify(data))
    }
}
