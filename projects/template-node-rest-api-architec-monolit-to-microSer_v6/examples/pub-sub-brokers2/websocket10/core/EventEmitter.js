/**
 * EventEmitter — професійний клас для реалізації патерна Pub/Sub.
 * Підтримує складні шаблони підписки (Wildcards), керування черговістю виконання,
 * ліміти слухачів та автоматичне кешування результатів пошуку.
 *
 * @example
 * const emitter = new EventEmitter({ logger: console, maxListeners: 15 });
 *
 * // 1. Проста підписка
 * emitter.on('app:start', async () => console.log('Система готова'));
 *
 * // 2. Wildcard '*' — відповідає одному сегменту (слову)
 * // Спрацює на 'user.login', 'user.logout', але не на 'user.settings.update'
 * emitter.on('user.*', (data, eventName) => {
 *     console.log(`Подія користувача [${eventName}]:`, data);
 * });
 *
 * // 3. Wildcard '**' — відповідає будь-якій кількості сегментів
 * // Спрацює на будь-яку подію, що починається з 'logs.'
 * emitter.on('logs.**', (log) => {
 *     saveToDatabase(log);
 * });
 *
 * await emitter.emit('user.login', { id: 42 });
 * await emitter.emit('logs.system.error.critical', { msg: 'CPU High' });
 */
export class EventEmitter {
    /** @type {Map<string, Set<Function>>} */
    #events = new Map()

    /** @type {Map<string, RegExp>} */
    #regexCache = new Map()

    /** @type {Map<string, Array<Function>>} */
    #matchCache = new Map()

    /** @type {number} */
    #maxListeners = 10

    /** @type {boolean} */
    #isDestroyed = false

    /** @type {Object|null} */
    #logger = null

    /**
     * @param {Object} [options] - Параметри ініціалізації.
     * @param {Object} [options.logger] - Об'єкт логера.
     * @param {number} [options.maxListeners=20] - Максимальна кількість слухачів на одну подію (0 - безліміт).
     */
    constructor({ logger = null, maxListeners = 20 } = {}) {
        this.#logger = logger.child
            ? logger.child({ component: `${this.constructor.name}` })
            : logger

        this.#maxListeners = maxListeners

        this.#logger?.info?.(`[${this.constructor.name}] EventEmitter initialized`, {
            maxListeners: maxListeners,
        })
    }

    /* ===============================
     * Public API
     * =============================== */

    /**
     * Реєструє обробник для події або паттерна.
     *
     * @param {string} eventPattern - Назва події або паттерн ('*', '**').
     * @param {Function} handler - Асинхронна або синхронна функція-обробник.
     * @param {Object} [options] - Додаткові опції.
     * @param {boolean} [options.prepend=false] - Якщо true, додає обробник у початок черги виконання.
     * @returns {Function} Функція для відписки (unsubscribe).
     *
     * @example
     * const off = emitter.on('api:update', async (data) => {
     *   await updateUI(data);
     * });
     * // ... пізніше
     * off();
     */
    on(eventPattern, handler, { prepend = false } = {}) {
        this.#assertAlive()
        this.#assertEventName(eventPattern)
        this.#assertHandler(handler)

        let handlers = this.#events.get(eventPattern)
        if (!handlers) {
            handlers = new Set()
            this.#events.set(eventPattern, handlers)
        }

        // Перевірка на потенційний витік пам'яті
        if (this.#maxListeners > 0 && handlers.size >= this.#maxListeners) {
            this.#logger?.warn?.(
                `[${this.constructor.name}] Max listeners (${
                    this.#maxListeners
                }) reached for: "${eventPattern}"`,
            )
        }

        if (prepend) {
            // Перевпорядкування Set для додавання елемента в початок
            const newHandlers = new Set([handler, ...handlers])
            this.#events.set(eventPattern, newHandlers)
        } else {
            handlers.add(handler)
        }

        this.#clearCache()

        this.#logger?.debug?.(`[${this.constructor.name}] Handler registered`, {
            eventPattern,
            handlersCount: handlers.size,
        })

        return () => this.off(eventName, handler)
    }

    /**
     * Реєструє обробник, який спрацює лише один раз.
     *
     * @param {string} eventPattern - Назва події або паттерн.
     * @param {Function} handler - Функція-обробник.
     * @returns {Function} Функція для скасування підписки.
     *
     * @example
     * emitter.once('app:ready', () => console.log('Запущено один раз'));
     */
    once(eventPattern, handler) {
        const wrapped = async (...args) => {
            this.off(eventPattern, wrapped)
            return await handler(...args)
        }

        return this.on(eventPattern, wrapped)
    }

    /**
     * Спеціалізований метод для додавання обробника в початок черги.
     * Аналог виклику .on(eventName, handler, { prepend: true }).
     *
     * @param {string} eventPattern - Назва події.
     * @param {Function} handler - Функція-обробник.
     * @returns {Function} Функція для відписки.
     *
     * @example
     * emitter.prependListener('user:login', async () => {
     *   console.log('Цей обробник виконається першим');
     * });
     */
    prependListener(eventPattern, handler) {
        return this.on(eventPattern, handler, { prepend: true })
    }

    /**
     * Викликає всі обробники, що відповідають імені події (враховуючи Wildcards).
     * Виконання відбувається послідовно в порядку реєстрації.
     *
     * @param {string} eventName - Точна назва події (наприклад, 'user.login').
     * @param {...any} args - Аргументи, що передаються в обробники.
     * @returns {Promise<void>}
     *
     * @example
     * await emitter.emit('user.login', { id: 1, name: 'Admin' });
     */
    async emit(eventName, ...args) {
        this.#assertAlive()

        const handlers = this.#getMatchedHandlers(eventName)
        if (!handlers || handlers.size === 0) {
            this.#logger?.debug?.(
                `[${this.constructor.name}] Emit skipped (no listeners) for: "${eventName}"`,
                {
                    eventName,
                },
            )
            return
        }

        this.#logger?.debug?.(`[${this.constructor.name}] Emitting "${eventName}"`, {
            eventName,
            handlersCount: handlers.size,
        })

        // Виконуємо послідовно через копію масиву (безпечна ітерація)
        for (const handler of [...handlers]) {
            try {
                // Останнім аргументом додаємо eventName для зручності Wildcard-обробників
                await handler(...args, eventName)
            } catch (error) {
                this.#handleHandlerError(error, eventName, handler)
            }
        }
    }

    /**
     * Видаляє конкретний обробник для вказаної події/паттерна.
     *
     * @param {string} eventPattern - Назва події або паттерн.
     * @param {Function} handler - Посилання на функцію обробника.
     * @returns {boolean} True, якщо обробник був видалений.
     *
     * @example
     * emitter.off('data', myDataHandler);
     */
    off(eventPattern, handler) {
        this.#assertAlive()

        const handlers = this.#events.get(eventPattern)
        if (!handlers) return false

        const isRemoved = handlers.delete(handler)

        if (handlers.size === 0) {
            this.#events.delete(eventPattern)
        }

        this.#clearCache()

        this.#logger?.debug?.(`[${this.constructor.name}] Handler removed`, {
            eventPattern,
            isRemoved,
        })

        return isRemoved
    }

    /**
     * Очищує обробники для конкретної події або для всього емітера.
     *
     * @param {string|null} [eventPattern=null] - Назва події. Якщо null — видаляє абсолютно всі підписки.
     *
     * @example
     * emitter.removeAll('data');
     */
    removeAll(eventPattern = null) {
        this.#assertAlive()

        if (eventPattern) {
            this.#events.delete(eventPattern)
            this.#logger?.warn?.(`[${this.constructor.name}] Event handlers removed`, {
                eventPattern,
            })
        } else {
            this.#events.clear()
            this.#logger?.warn?.(`[${this.constructor.name}] All events removed`)
        }
        this.#clearCache()
    }

    /**
     * Повністю знищує емітер, очищує пам'ять та блокує подальшу роботу.
     *
     * @example
     * emitter.destroy();
     */
    destroy() {
        if (this.#isDestroyed) return
        this.#isDestroyed = true

        this.#events.clear()
        this.#clearCache()

        this.#logger?.info?.(`[${this.constructor.name}] EventEmitter destroyed`)
        this.#logger = null
    }

    /* ===============================
     * Internal helpers
     * =============================== */

    /**
     * Отримує список обробників, що відповідають імені події, використовуючи кеш.
     * @private
     * @param {string} eventName
     * @returns {Array<Function>}
     */
    #getMatchedHandlers(eventName) {
        if (this.#matchCache.has(eventName)) {
            return this.#matchCache.get(eventName)
        }

        const matched = []

        for (const [pattern, handlersSet] of this.#events) {
            if (pattern === eventName || this.#testPattern(pattern, eventName)) {
                matched.push(...handlersSet)
            }
        }

        this.#matchCache.set(eventName, matched)
        return matched
    }

    /**
     * Перевіряє відповідність події паттерну за допомогою регулярних виразів.
     * @private
     * @param {string} pattern
     * @param {string} eventName
     * @returns {boolean}
     */
    #testPattern(pattern, eventName) {
        if (!pattern.includes('*')) return false

        let regex = this.#regexCache.get(pattern)

        if (!regex) {
            // Перетворення паттерна:
            // '.' -> екранування точки
            // '**' -> будь-які символи (.+)
            // '*' -> будь-які символи крім точки ([^\.]+)
            const regexString = pattern
                .replace(/\./g, '\\.')
                .replace(/\*\*/g, '(.+)')
                .replace(/\*/g, '([^\\.]+)')

            regex = new RegExp(`^${regexString}$`)
            this.#regexCache.set(pattern, regex)
        }

        return regex.test(eventName)
    }

    /**
     * Скидає кеш результатів пошуку при зміні структури підписок.
     * @private
     */
    #clearCache() {
        this.#matchCache.clear()
        this.#regexCache.clear()
    }

    /** @private */
    #handleHandlerError(error, eventName, handler) {
        this.#logger?.error?.(`[${this.constructor.name}] Event handler error`, {
            eventName,
            handlerName: handler?.name ?? 'anonymous',
            message: error?.message,
            stack: error?.stack,
        })
    }

    /** @private */
    #assertAlive() {
        if (this.#isDestroyed) {
            const err = new Error(`[${this.constructor.name}] EventEmitter is destroyed`)
            this.#logger?.error?.(err.message)
            throw err
        }
    }

    /** @private */
    #assertEventName(eventName) {
        if (typeof eventName !== 'string' || eventName.length === 0) {
            throw new TypeError(`[${this.constructor.name}] eventName must be a non-empty string`)
        }
    }

    /** @private */
    #assertHandler(handler) {
        if (typeof handler !== 'function') {
            throw new TypeError(`[${this.constructor.name}] handler must be a function`)
        }
    }
}
