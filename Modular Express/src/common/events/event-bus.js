// event-bus.js
import { EventEmitter } from 'events'

/**
 * Глобальна шина подій для забезпечення слабкого зв'язку (Decoupling).
 */
class EventBus extends EventEmitter {
    constructor() {
        super()
        // Обмежуємо кількість слухачів для запобігання витоку пам'яті
        this.setMaxListeners(20)
    }

    /**
     * Публікація події
     * @param {string} event - Назва події (наприклад, 'auth:login')
     * @param {any} data - Дані події
     */
    emit(event, data) {
        console.log(`[EventBus] Event emitted: ${event}`)
        super.emit(event, data)
    }
}

// Експортуємо синглтон
export default new EventBus()
