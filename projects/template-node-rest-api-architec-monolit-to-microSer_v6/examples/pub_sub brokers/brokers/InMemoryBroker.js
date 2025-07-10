// src/brokers/InMemoryBroker.js
import MessageBroker from './MessageBroker.js'

/**
 * @class InMemoryBroker
 * @augments MessageBroker
 * @description Реалізація брокера повідомлень, яка працює повністю в пам'яті.
 * Підходить для комунікації між компонентами в межах одного Node.js процесу.
 * Повідомлення не персистентні (втрачаються при перезапуску) і не працюють між різними процесами/серверами.
 */
class InMemoryBroker extends MessageBroker {
    /**
     * @param {object} logger - Екземпляр логера.
     */
    constructor(logger) {
        super(logger) // Передаємо логер в батьківський конструктор
        /**
         * @private
         * @type {Map<string, Array<function(any): void>>}
         * @description Зберігає список функцій зворотного виклику для кожного топіка.
         */
        this.subscriptions = new Map()
        this.logger.info('Initialized "InMemoryBroker".')
    }

    /**
     * @override
     * @method connect
     * @description Для In-Memory брокера підключення не вимагає ніяких зовнішніх ресурсів.
     * @returns {Promise<void>} Вирішується негайно.
     */
    async connect() {
        this.logger.info('Connected (in-memory, no external resources needed).')
        return Promise.resolve()
    }

    /**
     * @override
     * @method disconnect
     * @description Для In-Memory брокера відключення очищає внутрішні підписки.
     * @returns {Promise<void>} Вирішується негайно.
     */
    async disconnect() {
        this.subscriptions.clear()
        this.logger.info('Disconnected (in-memory state cleared).')
        return Promise.resolve()
    }

    /**
     * @override
     * @method publish
     * @description Публікує повідомлення в заданий топік.
     * Всі підписники на цей топік отримують повідомлення негайно.
     * @param {string} topic - Назва топіка.
     * @param {object|string|number|boolean} message - Повідомлення для публікації.
     * @returns {Promise<void>} Вирішується після синхронного оброблення всіма підписниками.
     */
    async publish(topic, message) {
        this.logger.debug(`Publishing to "${topic}":`, message)
        const callbacks = this.subscriptions.get(topic)
        if (callbacks) {
            callbacks.forEach((callback) => {
                Promise.resolve()
                    .then(() => callback(message))
                    .catch((e) =>
                        this.logger.error(`Error in subscriber callback for topic "${topic}":`, e),
                    )
            })
        } else {
            this.logger.debug(`No subscribers for topic "${topic}". Message ignored.`)
        }
        return Promise.resolve()
    }

    /**
     * @override
     * @method subscribe
     * @description Підписується на повідомлення з заданого топіка.
     * @param {string} topic - Назва топіка.
     * @param {function(any): void} callback - Функція зворотного виклику, яка буде викликана при отриманні повідомлення.
     * @returns {Promise<void>} Вирішується після додавання підписки.
     */
    async subscribe(topic, callback) {
        if (!this.subscriptions.has(topic)) {
            this.subscriptions.set(topic, [])
        }
        this.subscriptions.get(topic).push(callback)
        this.logger.info(
            `Subscribed to topic: "${topic}". Current subscribers: ${
                this.subscriptions.get(topic).length
            }`,
        )
        return Promise.resolve()
    }

    /**
     * @override
     * @method unsubscribe
     * @description Відписується від повідомлень з заданого топіка, або конкретного колбека.
     * @param {string} topic - Назва топіка, від якого потрібно відписатися.
     * @param {function(any): void} [callback] - Опціонально: конкретна функція зворотного виклику для видалення.
     * Якщо не вказано, видаляються всі колбеки для цього топіка.
     * @returns {Promise<void>} Вирішується після відписки.
     */
    async unsubscribe(topic, callback) {
        if (!this.subscriptions.has(topic)) {
            this.logger.warn(`Cannot unsubscribe from "${topic}": topic not found.`)
            return Promise.resolve()
        }

        if (callback) {
            let callbacks = this.subscriptions.get(topic)
            const initialLength = callbacks.length
            callbacks = callbacks.filter((cb) => cb !== callback)
            this.subscriptions.set(topic, callbacks)
            if (callbacks.length < initialLength) {
                this.logger.info(
                    `Unsubscribed specific callback from topic: "${topic}". Remaining: ${callbacks.length}`,
                )
            } else {
                this.logger.warn(`Callback not found for topic: "${topic}". No change.`)
            }
        } else {
            this.subscriptions.delete(topic)
            this.logger.info(`Unsubscribed all callbacks from topic: "${topic}".`)
        }
        return Promise.resolve()
    }
}

export default InMemoryBroker
