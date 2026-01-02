import { BrokerAdapter } from '../../interfaces/BrokerAdapter.js'

/**
 * @file Реалізація адаптера брокера через Redis Pub/Sub для горизонтального масштабування.
 * @module adapters/broker/RedisBrokerAdapter
 */

/**
 * @typedef {import('../../core/MessageEnvelope.js').MessageEnvelopeDTO} MessageEnvelopeDTO
 */

/**
 * @callback BrokerMessageHandler
 * @param {Object} packet - Об'єкт, що містить конверт та метадані брокера.
 * @param {MessageEnvelopeDTO} packet.envelope - Конверт повідомлення.
 * @param {string} [packet.originId] - ID сервера-відправника.
 * @param {string} [packet.room] - Назва кімнати (опціонально).
 * @param {string} [packet.userId] - ID користувача (опціонально).
 * @param {string} channel - Реальний канал, з якого прийшло повідомлення.
 */

/**
 * Адаптер RedisBroker. Використовує механізм Redis Pub/Sub (PSUBSCRIBE)
 * для координації подій між кількома інстансами сервера.
 *
 * @class RedisBrokerAdapter
 * @extends BrokerAdapter
 */
export class RedisBrokerAdapter extends BrokerAdapter {
    /**
     * @param {Object} pubClient - Redis клієнт (напр. ioredis) для команди PUBLISH.
     * @param {Object} subClient - Redis клієнт для команди PSUBSCRIBE.
     * @param {Object} logger - Екземпляр логера з підтримкою методу .child().
     */
    constructor(pubClient, subClient, logger) {
        super()
        /** @private */
        this.pub = pubClient
        /** @private */
        this.sub = subClient
        /** @private */
        this.logger = logger.child ? logger.child({ service: 'RedisBroker' }) : logger

        /**
         * Реєстр активних підписок за паттернами.
         * @type {Map<string, BrokerMessageHandler>}
         * @private
         */
        this._callbacks = new Map()

        this._init()
    }

    /**
     * Налаштування системних подій Redis та обробка вхідних pmessage.
     * @private
     */
    _init() {
        // Обробка повідомлень за паттерном (Wildcards)
        this.sub.on('pmessage', (pattern, channel, message) => {
            const callback = this._callbacks.get(pattern)
            if (!callback) return

            try {
                const parsed = JSON.parse(message)
                // Викликаємо обробник, передаючи парсовані дані та контекст каналу
                callback(parsed, channel)
            } catch (error) {
                this.logger.error(`Deserialization failed on channel ${channel}`, {
                    error: error.message,
                    rawPayload: message.substring(0, 100), // Логуємо частину для дебагу
                })
            }
        })

        // Моніторинг стану підключення
        const logError = (type) => (err) =>
            this.logger.error(`Redis ${type} Client Error: ${err.message}`, { stack: err.stack })

        this.pub.on('error', logError('Pub'))
        this.sub.on('error', logError('Sub'))
    }

    /**
     * Публікує повідомлення в Redis топік.
     *
     * @param {string} topic - Назва топіка (напр. 'broker:main:room:123').
     * @param {Object} data - Об'єкт повідомлення для серіалізації.
     * @returns {Promise<void>}
     * @throws {Error} Якщо клієнт не підключений або JSON.stringify не вдався.
     */
    async publish(topic, data) {
        try {
            // Перевірка стану (опціонально, залежить від стратегії offline queue)
            if (this.pub.status && this.pub.status !== 'ready') {
                this.logger.warn(`Publishing to ${topic} while Redis status is ${this.pub.status}`)
            }

            const message = JSON.stringify(data)
            await this.pub.publish(topic, message)
        } catch (error) {
            this.logger.error(`Failed to publish message to ${topic}`, { error: error.message })
            throw error
        }
    }

    /**
     * Підписується на Redis паттерн (PSUBSCRIBE).
     * Якщо підписка на цей паттерн уже існує, новий колбек замінить старий.
     *
     * @param {string} pattern - Паттерн з використанням wildcards (напр. 'broker:main:*').
     * @param {BrokerMessageHandler} callback - Функція обробник.
     * @returns {Promise<void>}
     */
    async subscribe(pattern, callback) {
        try {
            if (!this._callbacks.has(pattern)) {
                await this.sub.psubscribe(pattern)
                this.logger.debug(`Redis PSUBSCRIBE: ${pattern}`)
            }
            this._callbacks.set(pattern, callback)
        } catch (error) {
            this.logger.error(`PSUBSCRIBE failed: ${pattern}`, { error: error.message })
            throw error
        }
    }

    /**
     * Скасовує підписку на паттерн (PUNSUBSCRIBE).
     *
     * @param {string} pattern - Паттерн, який необхідно видалити.
     * @returns {Promise<void>}
     */
    async unsubscribe(pattern) {
        try {
            if (this._callbacks.has(pattern)) {
                await this.sub.punsubscribe(pattern)
                this._callbacks.delete(pattern)
                this.logger.debug(`Redis PUNSUBSCRIBE: ${pattern}`)
            }
        } catch (error) {
            this.logger.error(`PUNSUBSCRIBE failed: ${pattern}`, { error: error.message })
            // Не кидаємо помилку далі, щоб не ламати workflow видалення кімнати/неймспейсу
        }
    }
}
