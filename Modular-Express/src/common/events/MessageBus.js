import { EventEmitter } from 'events'

/**
 * @typedef {Object} MessageBusOptions
 * @property {Object} [logger] - Об'єкт логера (напр. console або winston)
 * @property {Object} [externalProvider] - Клієнт для зовнішніх систем (Redis/RabbitMQ)
 */

/**
 * Глобальна шина подій для забезпечення слабкого зв'язку (Decoupling).
 * Дозволяє модулям спілкуватися між собою через події або механізм запит-відповідь.
 *
 * @example
 * const bus = new MessageBus({ logger: console });
 *
 * // Проста підписка
 * const unsubscribe = bus.on('user:created', (data) => console.log(data));
 *
 * // Публікація події
 * bus.emit('user:created', { id: 1, name: 'Ivan' });
 *
 * // Відписка
 * unsubscribe();
 */
export class MessageBus {
    /**
     * Створює екземпляр MessageBus.
     * @param {MessageBusOptions} [options={}] - Налаштування шини.
     */
    constructor({ logger = null, externalProvider = null } = {}) {
        /** @private */
        this.localBus = new EventEmitter()
        /** @private */
        this.logger = logger?.child?.({ component: 'MessageBus' }) ?? logger
        /** @private */
        this.externalProvider = externalProvider

        // Збільшуємо ліміт, щоб уникнути попереджень при масштабуванні фіч
        this.localBus.setMaxListeners(50)
    }

    // --- ОСНОВНІ МЕТОДИ (ПУБЛІКАЦІЯ / ПІДПИСКА) ---

    /**
     * Публікує подію в локальну шину та зовнішній провайдер (якщо він є).
     *
     * @param {string} event - Назва події.
     * @param {any} data - Дані, що передаються.
     * @returns {Promise<void>}
     *
     * @example
     * await bus.emit('order.placed', { orderId: 123, total: 500 });
     */
    async emit(event, data) {
        this.logger?.info?.(`[Bus:Emit] "${event}"`, { data })

        // 1. Локальний виклик
        this.localBus.emit(event, data)

        // 2. Зовнішній виклик (якщо підключено Redis/Rabbit)
        if (this.externalProvider?.publish) {
            try {
                await this.externalProvider.publish(event, data)
            } catch (err) {
                this.logger?.error?.(`[Bus:ExternalError] Publish failed for "${event}":`, err)
            }
        }
    }

    /**
     * Підписується на подію.
     *
     * @param {string} event - Назва події.
     * @param {Function} callback - Функція-обробник.
     * @returns {Function} Функція для відписки (Unsubscribe).
     *
     * @example
     * const unsub = bus.on('config.updated', (cfg) => apply(cfg));
     * // Пізніше:
     * unsub();
     */
    on(event, callback) {
        this.logger?.debug?.(`[Bus:Sub] New listener for "${event}"`)

        this.localBus.on(event, callback)
        this.externalProvider?.subscribe?.(event, callback)

        return () => {
            this.logger?.debug?.(`[Bus:Unsub] Removed listener for "${event}"`)
            this.localBus.removeListener(event, callback)
            this.externalProvider?.unsubscribe?.(event, callback)
        }
    }

    // --- ПРОСУНУТІ МЕТОДИ (ЗАПИТ - ВІДПОВІДЬ) ---

    /**
     * Надсилає запит і чекає на результат від іншого модуля.
     * Корисно для RPC-подібної взаємодії між модулями.
     *
     * @param {string} event - Назва події-запиту.
     * @param {Object} data - Параметри запиту.
     * @param {number} [timeout=5000] - Час очікування відповіді в мс.
     * @returns {Promise<any>} Результат виконання запиту.
     * @throws {Error} Якщо час очікування вичерпано.
     *
     * @example
     * try {
     *   const user = await bus.request('user:get_by_id', { id: 10 });
     *   console.log(user);
     * } catch (e) {
     *   console.error("Timeout or error", e);
     * }
     */
    async request(event, data, timeout = 5000) {
        const requestId = Math.random().toString(36).substring(7)
        const responseEvent = `${event}:res:${requestId}`

        this.logger?.debug?.(`[Bus:Request] "${event}" (ID: ${requestId})`)

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.localBus.removeAllListeners(responseEvent)
                reject(new Error(`[Bus:Timeout] No response for "${event}" after ${timeout}ms`))
            }, timeout)

            // Чекаємо відповідь один раз
            this.localBus.once(responseEvent, (result) => {
                clearTimeout(timer)
                resolve(result)
            })

            // Емітимо запит з ID для ідентифікації
            this.emit(event, { ...data, requestId })
        })
    }

    /**
     * Реєструє обробник запиту, який повертає дані ініціатору.
     * Працює в парі з методом `request`.
     *
     * @param {string} event - Назва події-запиту.
     * @param {Function} handler - Асинхронна функція, що повертає результат.
     *
     * @example
     * bus.respond('user:get_by_id', async (data) => {
     *   const user = await db.users.find(data.id);
     *   return user;
     * });
     */
    respond(event, handler) {
        this.on(event, async (payload) => {
            // Перевірка на об'єкт та наявність requestId
            if (!payload || typeof payload !== 'object') return

            const { requestId, ...data } = payload
            if (!requestId) return // Ігноруємо звичайні події без ID

            try {
                const result = await handler(data)
                this.emit(`${event}:res:${requestId}`, result)
            } catch (err) {
                this.logger?.error?.(`[Bus:RespondError] Handler for "${event}" failed:`, err)
                this.emit(`${event}:res:${requestId}`, { error: err.message })
            }
        })
    }
}

export default MessageBus
