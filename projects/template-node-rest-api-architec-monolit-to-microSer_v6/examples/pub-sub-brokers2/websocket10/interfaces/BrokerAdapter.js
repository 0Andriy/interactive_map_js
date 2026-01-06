/**
 * @file Abstract class for Broker Adapters.
 * @module interfaces/BrokerAdapter
 */

/**
 * @typedef {import('../core/MessageEnvelope.js').MessageEnvelopeDTO} MessageEnvelopeDTO
 */

/**
 * @callback MessageHandler
 * @param {Object} packet - Данные, полученные из брокера.
 * @param {MessageEnvelopeDTO} packet.envelope - Конверт сообщения.
 * @param {string} [packet.originId] - ID сервера-отправителя для предотвращения циклов.
 * @param {string} [packet.room] - Название комнаты (если применимо).
 * @param {string} [packet.userId] - ID пользователя (если применимо).
 * @param {string} channel - Реальное имя канала (топика), в который пришло сообщение.
 */

/**
 * @abstract
 * @class BrokerAdapter
 * @classdesc Абстрактный класс, определяющий контракт для брокеров сообщений (Redis, NATS, RabbitMQ).
 * Обеспечивает горизонтальное масштабирование (Pub/Sub между узлами сервера).
 */
export class BrokerAdapter {
    constructor() {
        if (this.constructor === BrokerAdapter) {
            /**
             * Запрет на создание экземпляра абстрактного класса.
             * @throws {Error}
             */
            throw new Error("Abstract class 'BrokerAdapter' cannot be instantiated.")
        }
    }

    /**
     * Публикует сообщение в конкретный топик или канал.
     *
     * @abstract
     * @param {string} topic - Название топика (напр. 'broker:chat:room:101').
     * @param {Object} data - Данные для публикации (будут сериализованы в JSON).
     * @returns {Promise<void>}
     * @throws {Error} Если метод не реализован или произошла ошибка сети.
     */
    async publish(topic, data) {
        throw new Error("Method 'publish()' must be implemented.")
    }

    /**
     * Подписывается на сообщения по определенному паттерну (шаблону).
     * Поддерживает wildcards (например, 'ns:room:*').
     *
     * @abstract
     * @param {string} pattern - Шаблон подписки.
     * @param {MessageHandler} callback - Функция-обработчик входящих сообщений.
     * @returns {Promise<void>}
     */
    async subscribe(pattern, callback) {
        throw new Error("Method 'subscribe()' must be implemented.")
    }

    /**
     * Отменяет подписку на определенный паттерн.
     * Важно для предотвращения утечек памяти при удалении комнат или неймспейсов.
     *
     * @abstract
     * @param {string} pattern - Шаблон, от которого нужно отписаться.
     * @returns {Promise<void>}
     */
    async unsubscribe(pattern) {
        throw new Error("Method 'unsubscribe()' must be implemented.")
    }
}
