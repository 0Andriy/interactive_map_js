/**
 * @fileoverview Асинхронна локальна реалізація Event Broker, що використовує пам'ять програми.
 */

import EventBrokerInterface from '../interfaces/EventBrokerInterface.js'

/**
 * Реалізація PubSub для використання в межах одного процесу/додатка.
 * Наслідує EventBrokerInterface та використовує queueMicrotask для асинхронності.
 */
class LocalPubSub extends EventBrokerInterface {
    /**
     * @private
     * @static
     * @type {LocalPubSub | null}
     */
    static #instance = null

    /** @type {object | null} */
    #logger = null

    /**
     * @param {object | null} [logger=null] Об'єкт логера.
     */
    constructor(logger = null) {
        super()
        if (LocalPubSub.#instance) {
            // Це захист від випадкового виклику new через рефлексію, якщо це можливо
            throw new Error(
                'Використовуйте LocalPubSub.getInstance() для отримання єдиного екземпляра.',
            )
        }
        /** @type {Object.<string, Array.<function(any): void>>} */
        this.subscribers = {}
        /** @type {object | null} */
        this.logger = logger
    }

    /**
     * Повертає єдиний екземпляр класу LocalPubSub (Singleton).
     * @static
     * @param {object | null} [logger=null] Опціональний логер, використовується при першому створенні.
     * @returns {LocalPubSub} Єдиний екземпляр LocalPubSub.
     */
    static getInstance(logger = null) {
        if (!LocalPubSub.#instance) {
            LocalPubSub.#instance = new LocalPubSub(logger)
        }
        return LocalPubSub.#instance
    }

    /**
     * @inheritdoc
     */
    subscribe(topic, callback) {
        if (!this.subscribers[topic]) {
            this.subscribers[topic] = []
        }
        this.subscribers[topic].push(callback)

        // Повертаємо об'єкт для зручного самостійного видалення підписки
        return {
            unsubscribe: () => this.unsubscribe(topic, callback),
        }
    }

    /**
     * @inheritdoc
     */
    unsubscribe(topic, callback) {
        if (!this.subscribers[topic]) {
            return
        }

        if (this.subscribers[topic]) {
            this.subscribers[topic] = this.subscribers[topic].filter((cb) => cb !== callback)
            if (this.subscribers[topic].length === 0) {
                delete this.subscribers[topic]
            }
            // Використання optional chaining для логування
            this.logger?.info(`[LocalPubSub]: Відписка від топіка "${topic}".`)
        }
    }

    /**
     * @inheritdoc
     * Використовує асинхронний підхід (queueMicrotask) для запобігання блокуванню основного потоку.
     */
    publish(topic, data) {
        if (!this.subscribers[topic]) {
            return
        }
        // Використання optional chaining для логування
        this.logger?.info(`[LocalPubSub]: Ініціюємо АСИНХРОННУ публікацію в топік "${topic}".`)
        // Використовуємо копію масиву, щоб уникнути проблем, якщо підписник відпишеться під час ітерації.
        const callbacks = [...this.subscribers[topic]]

        callbacks.forEach(async (callback) => {
            // Виконання колбека переноситься в Event Loop (мікрозадача)
            try {
                await callback(data)
            } catch (error) {
                // Обробка помилок в асинхронних обробниках
                this.logger?.error(`Помилка в обробнику події топіка "${topic}":`, error)
            }
        })

        this.logger?.info(`[LocalPubSub]: Метод publish завершено миттєво (видавець не чекає).`)
    }
}

export default LocalPubSub
