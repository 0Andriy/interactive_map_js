// WebSocketNamespace.js (Фрагмент змін)

class WebSocketNamespace {
    // ... інші приватні поля ...
    #serverInstanceId // Отримуємо ID інстанса

    /**
     * @param {string} name - Назва простору імен.
     * @param {Map<string, WebSocketConnection>} allConnections - Глобальна мапа активних з'єднань.
     * @param {object} [logger=null] - Опціональний об'єкт логера.
     * @param {object} [pubSubBroker=null] - Опціональний брокер повідомлень.
     * @param {string} [serverInstanceId=null] - ID поточного інстанса сервера. // Новий параметр
     */
    constructor(name, allConnections, logger = null, pubSubBroker = null, serverInstanceId = null) {
        this.name = name
        this.#allConnections = allConnections
        this.#logger = logger
        this.#pubSubBroker = pubSubBroker
        this.#serverInstanceId = serverInstanceId // Зберігаємо ID інстанса

        if (this.#pubSubBroker) {
            const channel = `ws:${this.name}`
            this.#pubSubBroker.subscribe(channel, this.#handleBrokerMessage)
        }
    }

    #handleBrokerMessage = (message) => {
        try {
            // Формат: { instanceId: 'uuid-сервера', roomName: 'general', ... }
            const data = JSON.parse(message)

            // >>>>>>> НОВА ЛОГІКА ПЕРЕВІРКИ <<<<<<<
            if (data.instanceId === this.#serverInstanceId) {
                this.#logger?.debug(
                    `Проігноровано повідомлення від власного інстанса (${data.instanceId}).`,
                )
                return // Ігноруємо повідомлення, яке ми самі відправили
            }

            this.#logger?.debug(
                `Отримано повідомлення від іншого інстанса (${data.instanceId}) для кімнати ${data.roomName}`,
            )

            // ... (решта логіки розсилки локальним клієнтам) ...
            this.broadcastToRoom(data.roomName, JSON.stringify(data.payload), data.excludeId)
        } catch (error) {
            // ... (обробка помилок) ...
        }
    }

    publishToBroker(roomName, payload, originalSenderId = null) {
        if (this.#pubSubBroker) {
            const channel = `ws:${this.name}`
            const message = JSON.stringify({
                instanceId: this.#serverInstanceId, // Додаємо ID нашого інстанса
                roomName,
                payload,
                excludeId: originalSenderId,
            })
            this.#pubSubBroker.publish(channel, message)
        }
    }

    // ... (решта класу без змін) ...
}

export default WebSocketNamespace
