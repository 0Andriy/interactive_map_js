/**
 * @fileoverview Адаптер для віддаленого Event Broker (наприклад, Redis).
 * Реалізація Event Broker, що використовує реальний клієнт Redis.
 */

import EventBrokerInterface from '../interfaces/EventBrokerInterface.js'

/**
 * Адаптер, що реалізує EventBrokerInterface, що імітує взаємодію з Redis PubSub сервісом через Redis клієнт.
 * Наслідує EventBrokerInterface.
 * Припускає, що 'redisClient' має методи 'subscribe', 'unsubscribe', 'publish' та 'on'.
 */
class RedisPubSubAdapter extends EventBrokerInterface {
    /**
     * @param {object} redisClient Реальний клієнт Redis (наприклад, результат createClient()).
     * @param {object | null} [logger=null] Об'єкт логера.
     */
    constructor(redisClient, logger = null) {
        super()
        this.redisClient = redisClient
        this.logger = logger
        this.subscriptions = new Map() // Зберігаємо локальні колбеки по топіках

        this.logger?.info('[RedisPubSubAdapter]: Ініціалізовано адаптер Redis.')

        // Налаштовуємо слухача для вхідних повідомлень від Redis
        this.redisClient.on('message', (channel, message) => {
            const topicCallbacks = this.subscriptions.get(channel)
            if (topicCallbacks) {
                // // Припустимо, що дані передаються як JSON-рядок
                // const parsedData = JSON.parse(message)
                topicCallbacks.forEach((callback) => {
                    callback(message)
                })
            }
        })
    }

    /**
     * @inheritdoc
     */
    subscribe(topic, callback) {
        if (!this.subscriptions.has(topic)) {
            this.subscriptions.set(topic, [])
            // Реальна підписка на канал Redis
            this.redisClient.subscribe(topic)
            this.logger?.info(`[RedisPubSubAdapter]: Підписано на канал Redis: "${topic}"`)
        }
        this.subscriptions.get(topic).push(callback)

        // Тут була б реальна логіка підписки на канал Redis.
        return {
            unsubscribe: () => this.unsubscribe(topic, callback),
        }
    }

    /**
     * @inheritdoc
     */
    unsubscribe(topic, callback) {
        const topicCallbacks = this.subscriptions.get(topic)
        if (topicCallbacks) {
            const updatedCallbacks = topicCallbacks.filter((cb) => cb !== callback)
            this.subscriptions.set(topic, updatedCallbacks)

            // Якщо підписників не залишилося, відписуємося від каналу Redis повністю
            if (updatedCallbacks.length === 0) {
                this.redisClient.unsubscribe(topic)
                this.subscriptions.delete(topic)
                this.logger?.info(`[RedisPubSubAdapter]: Відписано від каналу Redis: "${topic}"`)
            }
        }
    }

    /**
     * @inheritdoc
     */
    publish(topic, data) {
        // // Серіалізуємо дані в JSON перед відправкою через мережу
        // const message = JSON.stringify(data)
        this.redisClient.publish(topic, data)
        this.logger?.info(
            `[RedisPubSubAdapter]: Опубліковано повідомлення в канал Redis: "${topic}"`,
        )
    }
}

export default RedisPubSubAdapter
