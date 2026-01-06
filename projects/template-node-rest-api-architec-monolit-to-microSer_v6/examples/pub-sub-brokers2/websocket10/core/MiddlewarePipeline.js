/**
 * Клас для створення та керування асинхронним ланцюжком виконання (Middleware Pipeline).
 * Дозволяє послідовно виконувати функції з передачею контексту та керуванням потоком через next().
 *
 * @example
 * const pipeline = new MiddlewarePipeline({ logger: console });
 *
 * pipeline.use(async (ctx, next) => {
 *   ctx.start = Date.now();
 *   await next();
 *   console.log(`Duration: ${Date.now() - ctx.start}ms`);
 * });
 *
 * pipeline.use(async (ctx) => {
 *   ctx.user = { id: 1, name: 'John' };
 * });
 *
 * await pipeline.run({ requestId: '123' });
 */
export class MiddlewarePipeline {
    /** @type {Array<Function>} */
    #middlewares = []

    /** @type {boolean} */
    #isDestroyed = false

    /** @type {Object|null} */
    #logger = null

    /**
     * @param {Object} [options] - Параметри ініціалізації.
     * @param {Object} [options.logger] - Об'єкт логера (очікується підтримка .info, .debug, .error, .child).
     */
    constructor({ logger = null } = {}) {
        this.#logger = logger.child
            ? logger.child({ component: `${this.constructor.name}` })
            : logger

        this.#logger?.info?.(`${this.constructor.name} MiddlewarePipeline initialized`)
    }

    /* ===============================
     * Public API
     * =============================== */

    /**
     * Реєструє нову функцію-middleware у ланцюжку.
     *
     * @param {Function} middleware - Асинхронна функція виду (context, next) => Promise<void>.
     * @throws {TypeError} Якщо middleware не є функцією.
     * @returns {this} Повертає екземпляр пайплайну для ланцюжкових викликів.
     *
     * @example
     * pipeline.use(async (ctx, next) => {
     *   if (!ctx.token) throw new Error('Unauthorized');
     *   await next();
     * });
     */
    use(middleware) {
        this.#assertAlive()
        this.#assertMiddleware(middleware)

        this.#middlewares.push(middleware)

        this.#logger?.debug?.(`${this.constructor.name} Middleware registered`, {
            count: this.#middlewares.length,
            name: middleware.name || 'anonymous',
        })

        return this
    }

    /**
     * Запускає виконання ланцюжка middleware.
     *
     * @param {Object} context - Об'єкт стану, що передається через усі middleware.
     * @throws {Error} Якщо пайплайн знищено або next() викликано більше одного разу в одній middleware.
     * @returns {Promise<void>}
     *
     * @example
     * const context = { userId: 42, roles: [] };
     *
     * try {
     *   await pipeline.run(context);
     *   console.log('Пайплайн успішно виконано:', context);
     * } catch (error) {
     *   console.error('Помилка виконання:', error);
     * }
     */
    async run(context) {
        this.#assertAlive()
        this.#assertContext(context)

        let index = -1

        /**
         * Рекурсивна функція для послідовного виклику middleware.
         * @param {number} i - Індекс поточної middleware.
         */
        const dispatch = async (i) => {
            if (i <= index) {
                throw new Error(`${this.constructor.name} next() called multiple times`)
            }

            index = i

            const middleware = this.#middlewares[i]
            if (!middleware) return

            const name = middleware.name || `anonymous@${i}`

            this.#logger?.debug?.(`${this.constructor.name} Middleware enter`, {
                index: i,
                name: name,
            })

            let nextCalled = false

            /**
             * Функція передачі керування наступній middleware.
             */
            const next = async () => {
                nextCalled = true
                await dispatch(i + 1)
            }

            try {
                await middleware(context, next)
            } catch (error) {
                this.#handleMiddlewareError(error, i, middleware, context)
                throw error
            } finally {
                if (!nextCalled && i < this.#middlewares.length - 1) {
                    this.#logger?.debug?.(`${this.constructor.name} Middleware stopped pipeline`, {
                        index: i,
                        name: name,
                    })
                }

                this.#logger?.debug?.(`${this.constructor.name} Middleware exit`, {
                    index: i,
                    name: name,
                })
            }
        }

        await dispatch(0)
    }

    /**
     * Очищує список зареєстрованих middleware.
     * @throws {Error} Якщо пайплайн знищено.
     */
    clear() {
        this.#assertAlive()
        this.#middlewares.length = 0
        this.#logger?.warn?.(`${this.constructor.name} MiddlewarePipeline cleared`)
    }

    /**
     * Позначає пайплайн як знищений та звільняє ресурси.
     * Подальше використання методів викликатиме помилку.
     */
    destroy() {
        if (this.#isDestroyed) return
        this.#isDestroyed = true

        this.#middlewares.length = 0

        this.#logger?.info?.(`${this.constructor.name} MiddlewarePipeline destroyed`)
        this.#logger = null
    }

    /* ===============================
     * Internal helpers
     * =============================== */

    /** @private */
    #assertAlive() {
        if (this.#isDestroyed) {
            const err = new Error(`${this.constructor.name} MiddlewarePipeline is destroyed`)
            this.#logger?.error?.(err.message)
            throw err
        }
    }

    /** @private */
    #assertMiddleware(fn) {
        if (typeof fn !== 'function') {
            throw new TypeError(`${this.constructor.name} Middleware must be a function`)
        }
    }

    /** @private */
    #assertContext(ctx) {
        if (ctx === null || typeof ctx !== 'object') {
            throw new TypeError(`${this.constructor.name} Context must be an object`)
        }
    }

    /** @private */
    #handleMiddlewareError(error, index, middleware, context) {
        this.#logger?.error?.(`${this.constructor.name} Middleware error`, {
            index,
            name: middleware?.name || 'anonymous',
            message: error?.message,
            stack: error?.stack,
            context,
        })
    }
}
