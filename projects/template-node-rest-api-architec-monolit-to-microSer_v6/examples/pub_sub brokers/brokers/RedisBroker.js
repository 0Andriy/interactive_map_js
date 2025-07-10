// src/brokers/RedisBroker.js
import { createClient } from 'redis'
import MessageBroker from './MessageBroker.js'

/**
 * @class RedisBroker
 * @augments MessageBroker
 * @description Реалізація брокера повідомлень, яка використовує Redis Pub/Sub.
 * Використовує офіційний Node.js клієнт 'redis'.
 */
class RedisBroker extends MessageBroker {
    /**
     * @param {object} config - Об'єкт конфігурації для Redis (хост, порт тощо).
     * @param {object} logger - Екземпляр логера.
     */
    constructor(config, logger) {
        super(logger)
        if (!config || !config.host || !config.port) {
            this.logger.error('RedisBroker: Missing required configuration (host, port).')
            throw new Error('Redis configuration is required.')
        }

        // URL для підключення до Redis
        this.redisUrl = `redis://${config.host}:${config.port}`
        if (config.password) {
            this.redisUrl = `redis://:${config.password}@${config.host}:${config.port}`
        }

        /**
         * @private
         * @type {import('redis').RedisClientType}
         * @description Клієнт Redis для публікації повідомлень.
         */
        this.publisher = null
        /**
         * @private
         * @type {import('redis').RedisClientType}
         * @description Клієнт Redis для підписки на повідомлення.
         */
        this.subscriber = null
        /**
         * @private
         * @type {Map<string, Set<function(any): void>>}
         * @description Зберігає функції зворотного виклику для кожного топіка (каналу).
         * Використовуємо Set, щоб уникнути дублювання колбеків.
         */
        this.subscriptions = new Map()

        this.logger.info(
            `RedisBroker initialized with URL: ${this.redisUrl.replace(/:\/\/[^@]*@/, '://***@')}`,
        ) // Приховуємо пароль для логів
    }

    /**
     * @override
     * @method connect
     * @description Встановлює з'єднання з Redis сервером.
     * @returns {Promise<void>}
     */
    async connect() {
        if (
            this.publisher &&
            this.publisher.isReady &&
            this.subscriber &&
            this.subscriber.isReady
        ) {
            this.logger.warn('RedisBroker is already connected and ready.')
            return
        }

        try {
            // Створюємо клієнтів
            this.publisher = createClient({ url: this.redisUrl })
            this.subscriber = createClient({ url: this.redisUrl })

            // Обробка помилок для обох клієнтів
            this.publisher.on('error', (err) => this.logger.error('Redis Publisher Error:', err))
            this.subscriber.on('error', (err) => this.logger.error('Redis Subscriber Error:', err))

            // Обробка підключення
            await Promise.all([this.publisher.connect(), this.subscriber.connect()])

            this.logger.info('Redis Publisher Connected.')
            this.logger.info('Redis Subscriber Connected.')

            // Обробник повідомлень для підписника
            // Використовуємо .subscribe() з колбеком, це дозволяє підписатися на кілька каналів
            // і отримати повідомлення через єдиний обробник 'message'.
            this.subscriber.on('message', (channel, message) => {
                this.logger.debug(`Received message on channel "${channel}":`, message)
                const callbacks = this.subscriptions.get(channel)
                if (callbacks) {
                    try {
                        const parsedMessage = JSON.parse(message)
                        callbacks.forEach((callback) => {
                            Promise.resolve()
                                .then(() => callback(parsedMessage))
                                .catch((e) =>
                                    this.logger.error(
                                        `Error in subscriber callback for channel "${channel}":`,
                                        e,
                                    ),
                                )
                        })
                    } catch (e) {
                        this.logger.error(
                            `Failed to parse message from channel "${channel}":`,
                            message,
                            e,
                        )
                    }
                }
            })

            this.logger.info('RedisBroker connected successfully.')
        } catch (error) {
            this.logger.error('Failed to connect to Redis:', error)
            // Закриваємо з'єднання, якщо відбулася помилка
            await this.disconnect()
            throw error
        }
    }

    /**
     * @override
     * @method disconnect
     * @description Розриває з'єднання з Redis сервером.
     * @returns {Promise<void>}
     */
    async disconnect() {
        // Очищаємо всі підписки Redis
        if (this.subscriber && this.subscriber.isReady && this.subscriptions.size > 0) {
            const channels = Array.from(this.subscriptions.keys())
            try {
                await this.subscriber.unsubscribe(channels) // Відписуємось від усіх каналів у Redis
                this.logger.info(`Unsubscribed from all Redis channels: ${channels.join(', ')}`)
            } catch (e) {
                this.logger.error('Error during mass unsubscribe from Redis:', e)
            }
        }

        // Закриваємо з'єднання
        if (this.publisher && this.publisher.isOpen) {
            await this.publisher.disconnect()
            this.publisher = null
            this.logger.info('Redis Publisher disconnected.')
        }
        if (this.subscriber && this.subscriber.isOpen) {
            await this.subscriber.disconnect()
            this.subscriber = null
            this.logger.info('Redis Subscriber disconnected.')
        }

        this.subscriptions.clear() // Очищаємо внутрішні підписки
        this.logger.info('RedisBroker disconnected successfully.')
    }

    /**
     * @override
     * @method publish
     * @description Публікує повідомлення в заданий топік (Redis канал).
     * @param {string} topic - Назва топіка (каналу).
     * @param {object|string|number|boolean} message - Повідомлення для публікації.
     * @returns {Promise<void>}
     */
    async publish(topic, message) {
        if (!this.publisher || !this.publisher.isReady) {
            this.logger.error(
                `RedisPublisher not connected or not ready. Cannot publish to "${topic}".`,
            )
            throw new Error('RedisPublisher is not connected or ready.')
        }
        try {
            // Redis Pub/Sub надсилає лише рядки, тому серіалізуємо об'єкти
            const payload = typeof message === 'string' ? message : JSON.stringify(message)
            await this.publisher.publish(topic, payload)
            this.logger.debug(`Published to Redis channel "${topic}":`, message)
        } catch (error) {
            this.logger.error(`Failed to publish to Redis channel "${topic}":`, error)
            throw error
        }
    }

    /**
     * @override
     * @method subscribe
     * @description Підписується на повідомлення з заданого топіка (Redis каналу).
     * @param {string} topic - Назва топіка (каналу).
     * @param {function(any): void} callback - Функція зворотного виклику.
     * @returns {Promise<void>}
     */
    async subscribe(topic, callback) {
        if (!this.subscriber || !this.subscriber.isReady) {
            this.logger.error(
                `RedisSubscriber not connected or not ready. Cannot subscribe to "${topic}".`,
            )
            throw new Error('RedisSubscriber is not connected or ready.')
        }

        // Додаємо колбек до нашого внутрішнього Map
        if (!this.subscriptions.has(topic)) {
            this.subscriptions.set(topic, new Set())
            // Якщо це перша підписка на цей топік, підписуємось у Redis
            try {
                // Бібліотека redis дозволяє передавати масив каналів або один канал
                await this.subscriber.subscribe(topic)
                this.logger.info(`Redis subscriber registered for channel: "${topic}".`)
            } catch (error) {
                this.logger.error(`Failed to subscribe to Redis channel "${topic}":`, error)
                throw error
            }
        }
        this.subscriptions.get(topic).add(callback)
        this.logger.info(
            `Subscribed callback to Redis topic: "${topic}". Total callbacks: ${
                this.subscriptions.get(topic).size
            }`,
        )
        return Promise.resolve()
    }

    /**
     * @override
     * @method unsubscribe
     * @description Відписується від повідомлень з заданого топіка (Redis каналу), або конкретного колбека.
     * @param {string} topic - Назва топіка.
     * @param {function(any): void} [callback] - Опціонально: конкретна функція зворотного виклику для видалення.
     * Якщо не вказано, видаляються всі колбеки для цього топіка.
     * @returns {Promise<void>}
     */
    async unsubscribe(topic, callback) {
        if (!this.subscriber || !this.subscriber.isReady) {
            this.logger.warn(
                `RedisSubscriber not connected or not ready. Cannot unsubscribe from "${topic}".`,
            )
            return Promise.resolve()
        }

        if (!this.subscriptions.has(topic)) {
            this.logger.warn(`No active subscriptions for topic "${topic}".`)
            return Promise.resolve()
        }

        const callbacks = this.subscriptions.get(topic)

        if (callback) {
            // Видаляємо конкретний колбек
            const deleted = callbacks.delete(callback)
            if (deleted) {
                this.logger.info(
                    `Unsubscribed specific callback from Redis topic: "${topic}". Remaining: ${callbacks.size}`,
                )
            } else {
                this.logger.warn(`Callback not found for Redis topic: "${topic}". No change.`)
            }
        } else {
            // Видаляємо всі колбеки для цього топіка
            callbacks.clear()
            this.logger.info(`Cleared all callbacks for Redis topic: "${topic}".`)
        }

        // Якщо для топіка більше немає зареєстрованих колбеків, відписуємось від Redis каналу
        if (callbacks.size === 0) {
            try {
                await this.subscriber.unsubscribe(topic) // Відписуємось від каналу у Redis
                this.subscriptions.delete(topic)
                this.logger.info(`Redis subscriber unsubscribed from channel: "${topic}".`)
            } catch (error) {
                this.logger.error(`Failed to unsubscribe from Redis channel "${topic}":`, error)
                throw error
            }
        }
        return Promise.resolve()
    }
}

export default RedisBroker
