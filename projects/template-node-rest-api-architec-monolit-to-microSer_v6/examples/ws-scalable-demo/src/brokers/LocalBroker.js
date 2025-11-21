// src/brokers/LocalBroker.js
import IMessageBroker from './IMessageBroker.js'

/**
 * Локальний брокер для роботи в межах одного екземпляра сервера.
 */
export default class LocalBroker extends IMessageBroker {
    constructor() {
        super()
        this.handlers = new Map() // Зберігаємо обробники підписок локально
    }

    publish(channel, message) {
        // Імітація публікації: викликаємо всі зареєстровані обробники
        if (this.handlers.has(channel)) {
            this.handlers.get(channel).forEach((handler) => handler(message))
        }
    }

    subscribe(channel, handler) {
        if (!this.handlers.has(channel)) {
            this.handlers.set(channel, [])
        }
        this.handlers.get(channel).push(handler)
        console.log(`[LocalBroker] Підписано на канал: ${channel}`)
    }

    unsubscribe(channel, handler) {
        // Логіка відписки (для простоти пропущено)
    }
}
