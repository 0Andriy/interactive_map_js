/**
 * EventEmitter - клас для обробки подій.
 * Дозволяє реєструвати, видаляти та викликати обробники подій.
 * Pub/Sub патерн.
 */
export class EventEmitter {
    #events = new Map()
    #isDestroyed = false
    #logger = null

    constructor({ logger = null } = {}) {
        this.#logger = logger.child
            ? logger.child({ component: `${this.constructor.name}` })
            : logger

        this.#logger?.info?.(`[${this.constructor.name}] EventEmitter initialized`)
    }

    /* ===============================
     * Public API
     * =============================== */

    /**
     * Реєструє обробник для вказаної події.
     *
     * @param {string} eventName - Назва події.
     * @param {Function} handler - Функція-обробник події.
     * @returns {Function} Функція для видалення зареєстрованого обробника.
     * @example
     * const unsubscribe = emitter.on('data', (data) => {
     *     console.log('Received data:', data);
     * });
     */
    on(eventName, handler) {
        this.#assertAlive()
        this.#assertEventName(eventName)
        this.#assertHandler(handler)

        let handlers = this.#events.get(eventName)
        if (!handlers) {
            handlers = new Set()
            this.#events.set(eventName, handlers)
        }

        handlers.add(handler)

        this.#logger?.debug?.(`[${this.constructor.name}] Handler registered`, {
            eventName,
            handlersCount: handlers.size,
        })

        return () => this.off(eventName, handler)
    }

    /**
     * Видаляє обробник для вказаної події.
     *
     * @param {string} eventName - Назва події.
     * @param {Function} handler - Функція-обробник події.
     * @returns {boolean} Повертає true, якщо обробник був видалений, false інакше.
     * @example
     * emitter.off('data', myDataHandler);
     */
    off(eventName, handler) {
        this.#assertAlive()

        const handlers = this.#events.get(eventName)
        if (!handlers) return false

        const removed = handlers.delete(handler)

        if (handlers.size === 0) {
            this.#events.delete(eventName)
        }

        this.#logger?.debug?.(`[${this.constructor.name}] Handler removed`, {
            eventName,
            removed,
        })

        return removed
    }

    /**
     * Викликає всі обробники для вказаної події з переданими аргументами.
     *
     * @param {string} eventName - Назва події.
     * @param {...any} args - Аргументи для передачі обробникам події.
     * @returns {Promise<void>}
     * @example
     * await emitter.emit('data', { id: 1, value: 'test' });
     */
    async emit(eventName, ...args) {
        this.#assertAlive()

        const handlers = this.#events.get(eventName)
        if (!handlers || handlers.size === 0) {
            this.#logger?.debug?.(`[${this.constructor.name}] Emit skipped (no handlers)`, {
                eventName,
            })
            return
        }

        this.#logger?.debug?.(`[${this.constructor.name}] Emit event`, {
            eventName,
            handlersCount: handlers.size,
        })

        for (const handler of handlers) {
            try {
                await handler(...args)
            } catch (err) {
                this.#handleHandlerError(err, eventName, handler)
            }
        }
    }

    /**
     * Реєструє одноразовий обробник для вказаної події.
     *
     * @param {string} eventName - Назва події.
     * @param {Function} handler - Функція-обробник події.
     * @returns {Function} Функція для видалення зареєстрованого обробника.
     * @example
     * emitter.once('data', (data) => {
     *     console.log('Received data once:', data);
     * });
     */
    once(eventName, handler) {
        this.#assertAlive()
        this.#assertHandler(handler)

        const wrapped = async (...args) => {
            try {
                await handler(...args)
            } finally {
                this.off(eventName, wrapped)
            }
        }

        return this.on(eventName, wrapped)
    }

    /**
     * Видаляє всі обробники для вказаної події або всі обробники взагалі.
     *
     * @param {string|null} eventName - Назва події або null для видалення всіх обробників.
     * @example
     * emitter.removeAll('data');
     */
    removeAll(eventName = null) {
        this.#assertAlive()

        if (eventName === null) {
            this.#events.clear()
            this.#logger?.warn?.(`[${this.constructor.name}] All events removed`)
            return
        }

        this.#events.delete(eventName)
        this.#logger?.warn?.(`[${this.constructor.name}] Event handlers removed`, { eventName })
    }

    /**
     *
     *
     * @example
     * emitter.destroy();
     */
    destroy() {
        if (this.#isDestroyed) return

        this.#events.clear()
        this.#isDestroyed = true

        this.#logger?.info?.(`[${this.constructor.name}] EventEmitter destroyed`)
    }

    /* ===============================
     * Internal helpers
     * =============================== */

    #handleHandlerError(error, eventName, handler) {
        this.#logger?.error?.(`[${this.constructor.name}] Event handler error`, {
            eventName,
            handlerName: handler?.name ?? 'anonymous',
            message: error?.message,
            stack: error?.stack,
        })
    }

    #assertAlive() {
        if (this.#isDestroyed) {
            const err = new Error(`[${this.constructor.name}] EventEmitter is destroyed`)
            this.#logger?.error?.(err.message)
            throw err
        }
    }

    #assertEventName(eventName) {
        if (typeof eventName !== 'string' || eventName.length === 0) {
            throw new TypeError(`[${this.constructor.name}] eventName must be a non-empty string`)
        }
    }

    #assertHandler(handler) {
        if (typeof handler !== 'function') {
            throw new TypeError(`[${this.constructor.name}] handler must be a function`)
        }
    }
}
