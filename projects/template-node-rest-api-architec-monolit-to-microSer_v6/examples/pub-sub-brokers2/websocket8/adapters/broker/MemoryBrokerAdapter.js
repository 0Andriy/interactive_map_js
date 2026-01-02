import { BrokerAdapter } from '../../interfaces/BrokerAdapter.js'
import { PubSub } from '../../core/PubSub.js'

/**
 * @file Локальна реалізація брокера для розробки та тестів.
 * @module adapters/broker/MemoryBrokerAdapter
 */

/**
 * MemoryBrokerAdapter використовує локальний механізм PubSub для імітації
 * роботи брокера повідомлень у межах одного вузла (Node.js процесу).
 *
 * @class MemoryBrokerAdapter
 * @extends BrokerAdapter
 */
export class MemoryBrokerAdapter extends BrokerAdapter {
    /**
     * @param {Object} logger - Екземпляр логера.
     */
    constructor(logger) {
        super()
        /**
         * Внутрішній двигун для обробки подій та шаблонів.
         * @private
         */
        this._engine = new PubSub()
        this.logger = logger.child ? logger.child({ service: 'MemoryBroker' }) : logger

        /**
         * Карта для зберігання функцій відписки.
         * @type {Map<string, Function>}
         * @private
         */
        this._unsubscribers = new Map()
    }

    /**
     * Публікує повідомлення локально.
     * @param {string} topic
     * @param {Object} data
     */
    async publish(topic, data) {
        this.logger.debug(`Local publish: [${topic}]`)
        // Публікація в пам'яті зазвичай синхронна, але ми повертаємо проміс згідно з контрактом
        await this._engine.emit(topic, data)
    }

    /**
     * Підписується на паттерн повідомлень.
     * @param {string} pattern - Шаблон (напр. 'broker:chat:*').
     * @param {Function} callback - Обробник повідомлення.
     */
    async subscribe(pattern, callback) {
        if (this._unsubscribers.has(pattern)) {
            this.logger.warn(`Already subscribed to pattern: ${pattern}. Overwriting.`)
            this.unsubscribe(pattern)
        }

        const unsub = this._engine.on(pattern, callback)
        this._unsubscribers.set(pattern, unsub)

        this.logger.info(`Local subscription created: ${pattern}`)
    }

    /**
     * Скасовує підписку на паттерн.
     * @param {string} pattern
     */
    async unsubscribe(pattern) {
        const unsub = this._unsubscribers.get(pattern)
        if (unsub) {
            unsub() // Викликаємо функцію відписки, яку повернув PubSub.on
            this._unsubscribers.delete(pattern)
            this.logger.debug(`Local subscription removed: ${pattern}`)
        }
    }

    /**
     * Очищення всіх підписок.
     */
    async clear() {
        this._engine.clear()
        this._unsubscribers.clear()
        this.logger.debug('Memory broker cleared')
    }
}
