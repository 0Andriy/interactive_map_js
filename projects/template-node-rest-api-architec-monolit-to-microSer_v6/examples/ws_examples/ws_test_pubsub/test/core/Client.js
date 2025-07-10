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
        this.connectedAt = new Date()

        this.logger.debug(
            `Client connection "${this.id}" for User "${this.username}" (ID: ${this.userId}) created.`,
        )
    }

    /**
     * Відправляє повідомлення цьому конкретному підключенню через WebSocket.
     * @param {object|string} payload - Об'єкт повідомлення для відправки.
     */
    send(payload, options = {}) {
        if (this.ws && this.ws.readyState === this.ws.OPEN) {
            try {
                const payload = typeof data === 'string' ? data : JSON.stringify(data)
                this.ws.send(payload, options)

                this.logger.debug(
                    `[To Client Conn: ${this.id} | User: ${this.username} (${
                        this.userId
                    })]: ${payload.substring(0, 100)}...`,
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

    /**
     * Закриває WebSocket з'єднання.
     * Не викликайте напряму, якщо ви використовуєте `Server.disconnectClient`.
     */
    close() {
        if (this.ws.readyState === this.ws.OPEN || this.ws.readyState === this.ws.CONNECTING) {
            this.ws.close()
            this.logger.info(`З'єднання для клієнта ${this.id} закрито.`)
        }
    }
}

export { Client }
