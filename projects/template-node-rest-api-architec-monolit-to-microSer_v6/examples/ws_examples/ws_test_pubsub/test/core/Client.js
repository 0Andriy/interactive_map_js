// src/core/Client.js

/**
 * Представляє одне підключення клієнта (аналог сокета).
 * Тепер розрізняє ID підключення та ID користувача.
 */
class Client {
    /**
     * @param {string} id - Унікальний ідентифікатор ЦЬОГО підключення (аналог socket.id).
     * @param {string} userId - Ідентифікатор користувача, який може мати багато підключень.
     * @param {string} username - Ім'я користувача (для логування/відображення).
     * @param {object} ws - Реальний WebSocket-сокет (екземпляр ws.WebSocket).
     * @param {object} [logger=console] - Логер.
     */
    constructor(id, userId, username, ws, logger = console) {
        this.id =
            id ||
            (typeof crypto !== 'undefined' && crypto.randomUUID
                ? crypto.randomUUID()
                : `conn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`)
        this.userId = userId || this.id // Якщо userId не надано, використовуємо ID підключення за замовчуванням
        this.username = username || `Guest_${this.id.toString().substring(7, 12)}`
        this.ws = ws
        this.logger = logger

        this.logger.debug(
            `Client connection "${this.id}" for User "${this.username}" (ID: ${this.userId}) created.`,
        )
    }

    /**
     * Відправляє повідомлення цьому конкретному підключенню через WebSocket.
     * @param {object} payload - Об'єкт повідомлення для відправки.
     */
    send(payload) {
        if (this.ws && this.ws.readyState === this.ws.OPEN) {
            try {
                this.ws.send(JSON.stringify(payload))
                this.logger.debug(
                    `[To Client Conn: ${this.id} | User: ${this.username} (${
                        this.userId
                    })]: ${JSON.stringify(payload)}`,
                )
            } catch (error) {
                this.logger.error(
                    `Error sending message to client connection ${this.id} for User ${this.username} (${this.userId}): ${error.message}`,
                )
            }
        } else {
            this.logger.warn(
                `Attempted to send message to closed/unready client connection ${this.id} for User ${this.username} (${this.userId}).`,
            )
        }
    }
}

export { Client }
