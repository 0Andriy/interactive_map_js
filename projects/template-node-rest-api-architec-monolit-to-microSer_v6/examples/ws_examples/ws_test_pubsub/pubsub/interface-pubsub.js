// pubsub/interface.js

export class PubSubService {
    /**
     * Публікує повідомлення в канал.
     * @param {string} channel
     * @param {object} message
     */
    publish(channel, message) {
        throw new Error("Метод 'publish' не реалізовано")
    }

    /**
     * Підписується на канал для отримання повідомлень.
     * @param {string} channel
     * @param {(message: object) => void} handler - Функція, що викликається при отриманні повідомлення.
     * @returns {() => void} Функція, яку можна викликати для відписки від цього конкретного обробника.
     */
    subscribe(channel, handler) {
        throw new Error("Метод 'subscribe' не реалізовано")
    }

    /**
     * Відписується від каналу.
     * Якщо `handler` не передано, відписує всі обробники від каналу.
     * @param {string} channel
     * @param {(message: object) => void} [handler] - Функція, що була підписана.
     */
    unsubscribe(channel, handler) {
        throw new Error("Метод 'unsubscribe' не реалізовано")
    }

    /**
     * Закриває з'єднання з брокером повідомлень та звільняє ресурси.
     * @returns {Promise<void>}
     */
    async disconnect() {
        // За замовчуванням нічого не робить, але реалізації можуть перевизначити цей метод.
    }
}
