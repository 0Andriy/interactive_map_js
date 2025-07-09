// pubsub/redis-pubsub.js
import { createClient } from 'redis'
import { PubSubService } from './interface-pubsub.js'

export class RedisPubSub extends PubSubService {
    /**
     * @type {ReturnType<typeof createClient>}
     */
    publisher
    /**
     * @type {ReturnType<typeof createClient>}
     */
    subscriber
    /**
     * @type {Promise<void>}
     */
    connectedPromise
    /**
     * @type {Console}
     */
    logger
    /**
     * Зберігаємо обробники для кожного каналу, оскільки redis.subscribe працює на рівні каналу,
     * а не окремого обробника. Це дозволяє мати кілька JS-обробників на один Redis-канал.
     * @type {{[channel: string]: Array<(message: object) => void>}}
     */
    channelHandlers = {}

    /**
     * @param {{url: string, logger?: Console, password?: string, socket?: object, ...rest: any}} options - Опції для RedisPubSub.
     * `url` є обов'язковим. Інші опції передаються безпосередньо в `redis.createClient`.
     */
    constructor({ url, logger = console, ...redisClientOptions }) {
        super()
        this.logger = logger

        // Створюємо два клієнти, як рекомендує документація redis:
        // один для публікації, інший для підписок.
        // Усі додаткові redisClientOptions передаються в createClient.
        this.publisher = createClient({ url, ...redisClientOptions })
        this.subscriber = this.publisher.duplicate()

        // Обробка помилок клієнтів Redis.
        this.publisher.on('error', (error) => {
            this.logger.error(`[Redis] Помилка Publisher:`, error)
        })
        this.subscriber.on('error', (error) => {
            this.logger.error(`[Redis] Помилка Subscriber:`, error)
        })

        // Ініціалізація підключення.
        this.connectedPromise = Promise.all([this.publisher.connect(), this.subscriber.connect()])
            .then(() => {
                this.logger.info(`✅ Підключено до Redis`)
                // Встановлюємо глобального слухача для всіх повідомлень, отриманих від Redis.
                this.subscriber.on('message', this.#handleRedisMessage.bind(this))
            })
            .catch((error) => {
                this.logger.error(`❌ Не вдалося підключитися до Redis:`, error)
                // Важливо кинути помилку, щоб викликаючий код знав про невдале підключення.
                throw error
            })
    }

    /**
     * Приватний метод для обробки повідомлень, отриманих від Redis.
     * Десеріалізує повідомлення та викликає всі зареєстровані внутрішні обробники.
     * @param {string} channel
     * @param {string} message
     */
    #handleRedisMessage(channel, message) {
        const handlers = this.channelHandlers[channel]
        if (!handlers) {
            // Це може статися, якщо канал відписано або обробники видалено
            // до того, як прийшло повідомлення, або якщо Redis відправив повідомлення на канал,
            // на який ми більше не підписані.
            this.logger.warn(
                `[Redis] Отримано повідомлення для каналу '${channel}', але немає активних обробників.`,
            )
            return
        }

        let parsedMessage
        try {
            parsedMessage = JSON.parse(message)
        } catch (error) {
            this.logger.error(
                `[Redis] Помилка десеріалізації повідомлення для каналу '${channel}':`,
                error,
            )
            return
        }

        // Викликаємо всі внутрішні обробники для цього каналу асинхронно та з обробкою помилок.
        handlers.forEach((handler) => {
            setTimeout(() => {
                // Асинхронний виклик для ізоляції та неблокування
                try {
                    handler(parsedMessage)
                } catch (error) {
                    this.logger.error(
                        `[Redis] Помилка обробки повідомлення обробником для каналу '${channel}':`,
                        error,
                    )
                }
            }, 0)
        })
    }

    /**
     * Публікує повідомлення в канал Redis.
     * @param {string} channel
     * @param {object} message
     */
    async publish(channel, message) {
        try {
            await this.connectedPromise // Чекаємо на успішне підключення до Redis.
            await this.publisher.publish(channel, JSON.stringify(message))
            // this.logger.debug(`[Redis] Опубліковано в канал '${channel}':`, message); // Можна додати для дебагу
        } catch (error) {
            this.logger.error(`[Redis] Помилка публікації в канал '${channel}':`, error)
            // Тут можна додати логіку повторних спроб або сповіщення про помилку.
        }
    }

    /**
     * Підписується на канал для отримання повідомлень через Redis.
     * Якщо це перша підписка на канал, також виконує підписку в Redis.
     * @param {string} channel
     * @param {(message: object) => void} handler - Функція, що викликається при отриманні повідомлення.
     * @returns {() => void} Функція для відписки від цього конкретного обробника.
     */
    async subscribe(channel, handler) {
        await this.connectedPromise // Чекаємо на успішне підключення.

        if (!this.channelHandlers[channel]) {
            this.channelHandlers[channel] = []
            // Якщо це перша підписка на цей канал серед наших внутрішніх обробників,
            // тоді підписуємося на сам Redis-канал.
            try {
                await this.subscriber.subscribe(channel)
                this.logger.info(`[Redis] Створено Redis підписку на канал: ${channel}`)
            } catch (error) {
                this.logger.error(`[Redis] Помилка Redis підписки на канал '${channel}':`, error)
                // Якщо підписка на Redis не вдалася, не додаємо внутрішній обробник.
                return () => {} // Повертаємо пусту функцію відписки.
            }
        }

        this.channelHandlers[channel].push(handler)
        this.logger.info(`[Redis] Додано внутрішній обробник на канал: ${channel}`)

        // Повертаємо функцію, яка дозволяє відписатися саме від цього обробника.
        return () => this.unsubscribe(channel, handler)
    }

    /**
     * Відписується від каналу.
     * Якщо `handler` не передано, відписує всі обробники для цього каналу.
     * Якщо після відписки не залишається обробників, відписує канал від Redis.
     * @param {string} channel
     * @param {(message: object) => void} [handler] - Функція, що була підписана.
     */
    async unsubscribe(channel, handler) {
        await this.connectedPromise // Чекаємо на успішне підключення.

        if (!this.channelHandlers[channel]) {
            return
        }

        if (handler) {
            // Видаляємо конкретний обробник з нашого внутрішнього списку.
            this.channelHandlers[channel] = this.channelHandlers[channel].filter(
                (h) => h !== handler,
            )
            this.logger.info(`[Redis] Відписка конкретного обробника від каналу: ${channel}`)
        } else {
            // Видаляємо всі обробники для цього каналу.
            delete this.channelHandlers[channel]
            this.logger.info(`[Redis] Відписка всіх обробників від каналу: ${channel}`)
        }

        // Якщо після видалення обробників (або конкретного, якщо список став порожнім)
        // немає більше внутрішніх обробників для цього каналу, відписуємося від Redis.
        if (!this.channelHandlers[channel] || this.channelHandlers[channel].length === 0) {
            try {
                await this.subscriber.unsubscribe(channel)
                this.logger.info(`[Redis] Видалено Redis підписку на канал: ${channel}`)
            } catch (error) {
                this.logger.error(`[Redis] Помилка Redis відписки від каналу '${channel}':`, error)
            }
        }
    }

    /**
     * Закриває з'єднання з Redis Publisher та Subscriber.
     */
    async disconnect() {
        try {
            await this.connectedPromise // Чекаємо на завершення початкового підключення.
            await Promise.all([this.publisher.disconnect(), this.subscriber.disconnect()])
            this.logger.info(`🔴 Відключено від Redis`)
        } catch (error) {
            this.logger.error(`[Redis] Помилка відключення від Redis:`, error)
        }
    }
}
