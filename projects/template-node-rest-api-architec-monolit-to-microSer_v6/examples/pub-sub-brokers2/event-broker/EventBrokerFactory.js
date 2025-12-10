/**
 * @fileoverview Фабрика для створення екземпляра Event Broker.
 * Приймає конфігурацію та залежності ззовні.
 */

import LocalPubSub from './implementations/LocalPubSub.js'
import RedisPubSubAdapter from './implementations/RedisPubSubAdapter.js'
import EventBrokerInterface from './interfaces/EventBrokerInterface.js'

/**
 * Клас-фабрика для надання правильної реалізації брокера подій.
 */
class EventBrokerFactory {
    /**
     * Статична властивість для зберігання єдиного екземпляра LocalPubSub (Singleton).
     * @private
     * @static
     * @type {LocalPubSub | null}
     */
    static #localInstance = null

    /**
     * Створює або повертає існуючий екземпляр обраного Event Broker на основі наданої конфігурації.
     * @static
     * @param {object} config Об'єкт конфігурації (наприклад, { type: 'local', env: 'dev' }).
     * @param {object | null} logger Об'єкт логера, що містить методи 'info' та 'error'.
     * @param {object | null} [dependencies=null] Клієнт Redis, якщо потрібно.
     * @returns {EventBrokerInterface} Конкретна реалізація Event Broker.
     */
    static createBroker(config, logger, dependencies = {}) {
        switch (config.type) {
            case 'local':
                // *** РЕАЛІЗАЦІЯ SINGLETON ***
                if (!EventBrokerFactory.#localInstance) {
                    // Якщо екземпляра ще немає, створюємо його і зберігаємо
                    logger?.info(
                        '[EventBrokerFactory]: Створення нового singleton екземпляра LocalPubSub.',
                    )
                    EventBrokerFactory.#localInstance = new LocalPubSub(logger)
                } else {
                    logger?.info(
                        '[EventBrokerFactory]: Повернення існуючого singleton екземпляра LocalPubSub.',
                    )
                }
                return EventBrokerFactory.#localInstance

            case 'redis':
                if (!dependencies.redisClient) {
                    throw new Error("Redis client must be provided in config for 'redis' type.")
                }
                return new RedisPubSubAdapter(dependencies.redisClient, logger)

            default:
                throw new Error(`Невідомий тип брокера в конфігурації: ${config.type}`)
        }
    }
}

export default EventBrokerFactory
