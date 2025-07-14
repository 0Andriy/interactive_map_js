import { createClient } from 'redis' // npm install redis
import { IPubSub } from '../interfaces/IPubSub.js'
import { ILogger } from '../interfaces/ILogger.js'

/**
 * @class RedisPubSub
 * @augments IPubSub
 * @description Реалізація IPubSub за допомогою Redis.
 */
class RedisPubSub extends IPubSub {
    #publisher
    #subscriber
    #logger
    #isReady = false
    #subscriptions = new Map() // Map<channel, Set<listener>>
    #config

    /**
     * @param {object} config - Конфігурація Redis (наприклад, { url: 'redis://localhost:6379' }).
     * @param {ILogger} logger - Екземпляр логера.
     */
    constructor(config, logger) {
        super()
        this.#logger = logger
        this.#config = config // Зберігаємо конфігурацію
        this.#logger.log('RedisPubSub initialized.')
    }

    async connect() {
        if (this.#publisher && this.#subscriber && this.#isReady) {
            this.#logger.debug('RedisPubSub already connected and ready.')
            return
        }

        this.#publisher = createClient(this.#config)
        this.#subscriber = createClient(this.#config)

        this.#setupListeners()

        try {
            await Promise.all([this.#publisher.connect(), this.#subscriber.connect()])
            this.#isReady = true
            this.#logger.log('Redis Pub/Sub clients connected and ready.')
        } catch (error) {
            this.#logger.error('Failed to connect Redis Pub/Sub clients:', error)
            throw error
        }
    }

    #setupListeners() {
        this.#publisher.on('error', (err) => this.#logger.error('Redis Publisher Error:', err))
        this.#subscriber.on('error', (err) => this.#logger.error('Redis Subscriber Error:', err))

        this.#publisher.on('connect', () => this.#logger.log('Redis Publisher Connected.'))
        this.#subscriber.on('connect', () => this.#logger.log('Redis Subscriber Connected.'))

        this.#subscriber.on('message', (channel, message) => {
            this.#logger.debug(`Redis message received on channel '${channel}':`, message)
            const listeners = this.#subscriptions.get(channel)
            if (listeners) {
                listeners.forEach((listener) => {
                    try {
                        listener(channel, JSON.parse(message)) // Парсимо JSON
                    } catch (e) {
                        this.#logger.error(
                            `Error parsing or executing listener for channel ${channel}:`,
                            e,
                        )
                    }
                })
            }
        })
    }

    async publish(channel, message) {
        if (!this.#isReady) {
            this.#logger.warn(`Redis Pub/Sub not ready. Message to '${channel}' not published.`)
            return
        }
        try {
            await this.#publisher.publish(channel, JSON.stringify(message))
            this.#logger.debug(`Published to channel '${channel}':`, message)
        } catch (e) {
            this.#logger.error(`Failed to publish to channel '${channel}':`, e)
        }
    }

    async subscribe(channel, listener) {
        if (!this.#isReady) {
            // Якщо не готовий, чекаємо або кидаємо помилку, залежить від бажаної поведінки
            this.#logger.warn(`Redis Pub/Sub not ready. Cannot subscribe to '${channel}'.`)
            return // Або throw new Error('Redis Pub/Sub not ready for subscription.');
        }

        if (!this.#subscriptions.has(channel)) {
            this.#subscriptions.set(channel, new Set())
            await this.#subscriber.subscribe(channel)
            this.#logger.log(`Subscribed to Redis channel: '${channel}'.`)
        }
        this.#subscriptions.get(channel).add(listener)
        this.#logger.debug(`Listener added for channel '${channel}'.`)
    }

    async unsubscribe(channel, listener) {
        const listeners = this.#subscriptions.get(channel)
        if (listeners) {
            listeners.delete(listener)
            if (listeners.size === 0) {
                await this.#subscriber.unsubscribe(channel)
                this.#subscriptions.delete(channel)
                this.#logger.log(`Unsubscribed from Redis channel: '${channel}'.`)
            }
        }
    }

    async close() {
        if (this.#publisher && this.#publisher.isOpen) {
            await this.#publisher.quit()
        }
        if (this.#subscriber && this.#subscriber.isOpen) {
            await this.#subscriber.quit()
        }
        this.#isReady = false
        this.#subscriptions.clear()
        this.#logger.log('Redis Pub/Sub clients closed.')
    }
}

export { RedisPubSub }
