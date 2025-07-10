// src/brokers/MessageBroker.js

/**
 * @abstract
 * @class MessageBroker
 * @description Абстрактний базовий клас для брокерів повідомлень.
 * Визначає інтерфейс, який мають реалізовувати всі конкретні брокери.
 */
class MessageBroker {
    /**
     * @param {object} logger - Екземпляр логера або об'єкт, що імітує інтерфейс логера.
     */
    constructor(logger) {
        if (new.target === MessageBroker) {
            throw new TypeError(
                'Cannot construct MessageBroker instances directly. This is an abstract class.',
            )
        }
        // Тепер логер приймається через DI і не створюється тут, якщо його немає
        // Відповідальність за надання логера лежить на тому, хто створює MessageBroker
        this.logger = logger
    }

    /**
     * @abstract
     * @method connect
     * @description Встановлює з'єднання з брокером повідомлень.
     * @returns {Promise<void>} Проміс, який вирішується після успішного підключення.
     * @throws {Error} Якщо метод не реалізовано в дочірньому класі.
     */
    async connect() {
        throw new Error("Method 'connect()' must be implemented by a concrete broker.")
    }

    /**
     * @abstract
     * @method disconnect
     * @description Розриває з'єднання з брокером повідомлень.
     * @returns {Promise<void>} Проміс, який вирішується після успішного відключення.
     * @throws {Error} Якщо метод не реалізовано в дочірньому класі.
     */
    async disconnect() {
        throw new Error("Method 'disconnect()' must be implemented by a concrete broker.")
    }

    /**
     * @abstract
     * @method publish
     * @description Публікує повідомлення в заданий топік.
     * @param {string} topic - Назва топіка (каналу), куди відправити повідомлення.
     * @param {object|string|number|boolean} message - Повідомлення, яке потрібно опублікувати.
     * @returns {Promise<void>} Проміс, який вирішується після публікації повідомлення.
     * @throws {Error} Якщо метод не реалізовано в дочірньому класі.
     */
    async publish(topic, message) {
        throw new Error(
            "Method 'publish(topic, message)' must be implemented by a concrete broker.",
        )
    }

    /**
     * @abstract
     * @method subscribe
     * @description Підписується на повідомлення з заданого топіка.
     * @param {string} topic - Назва топіка (каналу), на який потрібно підписатися.
     * @param {function(object|string|number|boolean): void} callback - Функція, яка буде викликана при отриманні повідомлення.
     * @returns {Promise<void>} Проміс, який вирішується після успішної підписки.
     * @throws {Error} Якщо метод не реалізовано в дочірньому класі.
     */
    async subscribe(topic, callback) {
        throw new Error(
            "Method 'subscribe(topic, callback)' must be implemented by a concrete broker.",
        )
    }

    /**
     * @abstract
     * @method unsubscribe
     * @description Відписується від повідомлень з заданого топіка, або конкретного колбека.
     * @param {string} topic - Назва топіка, від якого потрібно відписатися.
     * @param {function(object|string|number|boolean): void} [callback] - Опціонально: конкретна функція зворотного виклику для видалення.
     * Якщо не вказано, видаляються всі колбеки для цього топіка.
     * @returns {Promise<void>} Проміс, який вирішується після успішної відписки.
     * @throws {Error} Якщо метод не реалізовано в дочірньому класі.
     */
    async unsubscribe(topic, callback) {
        throw new Error(
            "Method 'unsubscribe(topic, callback)' must be implemented by a concrete broker.",
        )
    }
}

export default MessageBroker
