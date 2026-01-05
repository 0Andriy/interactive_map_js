/**
 * @file Реалізація локальної шини подій із підтримкою шаблонів (wildcards).
 * @module core/PubSub
 */

/**
 * @class PubSub
 * @classdesc Забезпечує механізм публікації/підписки з підтримкою паттернів (напр. 'user.*').
 */
export class PubSub {
    /**
     * @param {Object} options
     * @param {Object} [options.logger] - Інстанс логера для відстеження виконання.
     * @example
     * const pubsub = new PubSub({ logger })
     */
    constructor(options = {}) {
        /**
         * Карта підписників: pattern -> Set<callback>
         * @type {Map<string, Set<Function>>}
         * @private
         */
        this._subscribers = new Map()

        /**
         * Кеш скомпільованих регулярних виразів для оптимізації продуктивності.
         * @type {Map<string, RegExp>}
         * @private
         */
        this._regexCache = new Map()

        /** Інстанс логера
         * @type {Object|null}
         */
        this.logger = options.logger || null
    }

    /**
     * Підписка на подію або паттерн (напр. 'chat.*').
     * @param {string} pattern - Назва події або паттерн (напр. "orders.*", "chat:msg").
     * @param {Function} callback - Функція обробник.
     * @returns {Function} Функція для відписки (unsubscribe).
     * @example
     * const unsubscribe = pubsub.on('chat.*', (data) => {
     *     console.log('New chat event:', data)
     * })
     *
     * // Щоб відписатися:
     * unsubscribe()
     */
    on(pattern, callback) {
        if (typeof callback !== 'function') {
            throw new TypeError(`[${this.constructor.name}] Callback must be a function`)
        }

        if (!this._subscribers.has(pattern)) {
            this._subscribers.set(pattern, new Set())
            // Екрануємо крапку і перетворюємо * на .*
            const regexStr = '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$'
            this._regexCache.set(pattern, new RegExp(regexStr))
        }

        this._subscribers.get(pattern).add(callback)
        return () => this.off(pattern, callback)
    }

    /**
     * Відписка від події.
     * @param {string} pattern - Паттерн, на який була оформлена підписка.
     * @param {Function} callback - Обробник, який треба видалити.
     * @example
     * const callback = (data) => { console.log(data) }
     * pubsub.off('chat.*', callback)
     */
    off(pattern, callback) {
        const subs = this._subscribers.get(pattern)
        if (subs) {
            subs.delete(callback)
            if (subs.size === 0) {
                this._subscribers.delete(pattern)
                this._regexCache.delete(pattern)
            }
        }
    }

    /**
     * Асинхронно публікує дані у топік.
     * Викликає всі обробники, чиї паттерни збігаються з топіком.
     * @param {string} topic - Конкретний топік події (напр. "orders.created").
     * @param {any} data - Дані повідомлення.
     * @returns {Promise<void>}
     * @example
     * await pubsub.emit('chat.message', { text: 'Hello World' })
     */
    async emit(topic, data) {
        const tasks = []

        // Функція для виконання задачі
        async function _runTask(callback, data, topic) {
            try {
                await callback(data)
            } catch (error) {
                this.logger?.error?.(`[${this.constructor.name}] PubSub Error [${topic}]:`, error)
            }
        }

        for (const [pattern, subs] of this._subscribers.entries()) {
            const regex = this._regexCache.get(pattern)

            if (regex && regex.test(topic)) {
                for (const callback of subs) {
                    // Використовуємо проміси для паралельного виконання
                    tasks.push(_runTask(callback, data, topic))
                }
            }
        }

        // Чекаємо виконання всіх обробників паралельно
        await Promise.allSettled(tasks)
    }

    /**
     * Повне очищення всіх підписок та кешу.
     * @returns {void}
     * @example
     * pubsub.clear()
     */
    clear() {
        this._subscribers.clear()
        this._regexCache.clear()
    }
}
