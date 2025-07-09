// pubsub/in-memory-pubsub.js

import { PubSubService } from './interface-pubsub.js'

/**
 * Цей сервіс імітує Pub/Sub в пам'яті.
 * Він не буде працювати при масштабуванні на кілька екземплярів програми.
 */
export class InMemoryPubSub extends PubSubService {
    /**
     * @type {{[channel: string]: Array<(message: object) => void>}}
     */
    channels = {}
    /**
     * @type {Console}
     */
    logger

    /**
     * @param {{logger?: Console}} [options={}] - Опції для InMemoryPubSub.
     */
    constructor({ logger = console } = {}) {
        super()
        this.logger = logger
    }

    /**
     * Публікує повідомлення в канал.
     * Обробники викликаються асинхронно для ізоляції помилок.
     * @param {string} channel
     * @param {object} message
     */
    publish(channel, message) {
        const handlers = this.channels[channel]
        if (!handlers) {
            return
        }

        // Викликаємо всі обробники, підписані на цей канал, асинхронно та з обробкою помилок.
        // setTimeout з 0 затримкою робить виклики асинхронними, запобігаючи блокуванню
        // основного потоку, якщо обробник виконує тривалу операцію, та ізолює помилки.
        handlers.forEach((handler) => {
            setTimeout(() => {
                try {
                    handler(message)
                } catch (error) {
                    this.logger.error(
                        `[In-Memory] Помилка обробки повідомлення для каналу '${channel}':`,
                        error,
                    )
                }
            }, 0)
        })
    }

    /**
     * Підписується на канал для отримання повідомлень.
     * @param {string} channel
     * @param {(message: object) => void} handler - Функція, що викликається при отриманні повідомлення.
     * @returns {() => void} Функція для відписки від цього конкретного обробника.
     */
    subscribe(channel, handler) {
        if (!this.channels[channel]) {
            this.channels[channel] = []
        }

        this.channels[channel].push(handler)
        this.logger.info(`[In-Memory] Підписка на канал: ${channel}`)

        // Повертаємо функцію для відписки від цього конкретного обробника.
        return () => this.unsubscribe(channel, handler)
    }

    /**
     * Відписується від каналу.
     * Якщо `handler` не передано, відписує всі обробники від каналу.
     * @param {string} channel
     * @param {(message: object) => void} [handler] - Функція, що була підписана.
     */
    unsubscribe(channel, handler) {
        if (!this.channels[channel]) {
            return
        }

        if (handler) {
            // Видаляємо конкретний обробник.
            this.channels[channel] = this.channels[channel].filter((h) => h !== handler)
            this.logger.info(`[In-Memory] Відписка конкретного обробника від каналу: ${channel}`)
        } else {
            // Видаляємо всі обробники для цього каналу.
            delete this.channels[channel]
            this.logger.info(`[In-Memory] Відписка всіх обробників від каналу: ${channel}`)
        }

        // Якщо після видалення конкретного обробника канал стає порожнім, видаляємо його.
        if (this.channels[channel] && this.channels[channel].length === 0) {
            delete this.channels[channel]
        }
    }

    /**
     * Для In-Memory брокера disconnect не потрібен, але реалізований для відповідності інтерфейсу.
     * @returns {Promise<void>}
     */
    async disconnect() {
        this.logger.info(`[In-Memory] Сервіс відключено (не вимагає реального відключення).`)
        this.channels = {} // Очищаємо всі канали
    }
}
