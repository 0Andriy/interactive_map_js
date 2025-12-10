/**
 * @fileoverview Абстрактний інтерфейс для Брокера Подій (Event Broker Interface).
 * Всі конкретні реалізації повинні наслідувати цей клас і реалізовувати його методи.
 */

/**
 * @typedef {object} UnsubscribeToken
 * @property {function(): void} unsubscribe Метод для відписки від події.
 */

/**
 * @interface EventBrokerInterface
 */
class EventBrokerInterface {
    /**
     * Підписується на певний топік (подію).
     * @abstract
     * @param {string} topic Назва топіка або події.
     * @param {function(any): void} callback Функція зворотного виклику, яка буде викликана при публікації.
     * @returns {UnsubscribeToken} Об'єкт, що містить метод unsubscribe.
     */
    subscribe(topic, callback) {
        throw new Error("Метод 'subscribe' повинен бути реалізований в класі-нащадку.")
    }

    /**
     * Публікує дані в певний топік, сповіщаючи всіх підписників асинхронно.
     * @abstract
     * @param {string} topic Назва топіка або події.
     * @param {any} data Дані, які передаються підписникам.
     */
    publish(topic, data) {
        throw new Error("Метод 'publish' повинен бути реалізований в класі-нащадку.")
    }

    /**
     * Глобальний метод відписки від топіка за допомогою оригінального колбека.
     * @abstract
     * @param {string} topic Назва топіка.
     * @param {function(any): void} callback Оригінальна функція зворотного виклику, яку потрібно видалити.
     */
    unsubscribe(topic, callback) {
        throw new Error("Метод 'unsubscribe' повинен бути реалізований в класі-нащадку.")
    }
}

export default EventBrokerInterface
