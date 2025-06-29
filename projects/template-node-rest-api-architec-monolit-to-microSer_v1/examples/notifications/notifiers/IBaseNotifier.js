// notifications/notifiers/IBaseNotifier.js

/**
 * Абстрактний клас для всіх повідомлювачів.
 * Патерн: Strategy Interface — визначає контракт, який реалізують усі канали розсилки.
 */
export default class IBaseNotifier {
    /**
     * @param {Object} deps - Залежності
     * @param {Object} deps.logger - Інстанс логера (наприклад, winston)
     */
    constructor({ logger }) {
        this.logger = logger
    }

    /**
     * Метод відправки повідомлення.
     * @param {Object} notification - Дані повідомлення
     * @param {string} notification.to - Одержувач
     * @param {string} [notification.subject] - Тема повідомлення
     * @param {string} [notification.template] - Назва шаблону
     * @param {Object} [notification.data] - Дані для шаблону
     * @param {string} [notification.body] - Текст повідомлення (якщо не використовується шаблон)
     * @param {string} [notification.html] - HTML-повідомлення (для email)
     */
    async send(notification) {
        throw new Error('Method "send()" must be implemented')
    }
}
