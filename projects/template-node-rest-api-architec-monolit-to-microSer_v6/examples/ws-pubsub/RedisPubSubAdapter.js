// src/di/RedisPubSubAdapter.js

import Redis from 'ioredis'
import { PubSubAdapter } from './PubSubAdapter.js'

export class RedisPubSubAdapter extends PubSubAdapter {
    /**
     * @param {object} redisConfig Конфігурація ioredis
     */
    constructor(redisConfig) {
        super()
        this.publisher = new Redis(redisConfig)
        this.subscriber = new Redis(redisConfig)

        /** @type {Map<string, Set<function>>} */
        this.listeners = new Map()

        this.subscriber.on('message', this._handleMessage.bind(this))
        console.log('Using Redis PubSub Adapter.')
    }

    _handleMessage(channel, message) {
        const listeners = this.listeners.get(channel)
        if (listeners) {
            listeners.forEach((listener) => listener(channel, message))
        }
    }

    async publish(channel, message) {
        await this.publisher.publish(channel, message)
    }

    async subscribe(channel, listener) {
        if (!this.listeners.has(channel)) {
            this.listeners.set(channel, new Set())
            await this.subscriber.subscribe(channel)
        }
        this.listeners.get(channel).add(listener)
    }

    async unsubscribe(channel, listener) {
        const listeners = this.listeners.get(channel)
        if (listeners) {
            listeners.delete(listener)
            if (listeners.size === 0) {
                this.listeners.delete(channel)
                await this.subscriber.unsubscribe(channel)
            }
        }
    }

    /**
     * Закриває з'єднання Redis
     */
    async quit() {
        await this.publisher.quit()
        await this.subscriber.quit()
    }
}
