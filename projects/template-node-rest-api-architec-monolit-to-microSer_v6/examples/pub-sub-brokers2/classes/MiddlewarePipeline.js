/*
 *
 */
export class MiddlewarePipeline {
    #middlewares = []
    #isDestroyed = false
    #logger = null

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
     *
     * @param {*} middleware
     * @returns
     */
    use(middleware) {
        this.#assertAlive()
        this.#assertMiddleware(middleware)

        this.#middlewares.push(middleware)

        this.#logger?.debug?.(`${this.constructor.name} Middleware registered`, {
            count: this.#middlewares.length,
        })

        return this
    }

    /**
     *
     * @param {*} context
     */
    async run(context) {
        this.#assertAlive()
        this.#assertContext(context)

        let index = -1

        const dispatch = async (i) => {
            if (i <= index) {
                throw new Error(`${this.constructor.name} next() called multiple times`)
            }

            index = i

            const middleware = this.#middlewares[i]
            if (!middleware) return

            this.#logger?.debug?.(`${this.constructor.name} Middleware enter`, {
                index: i,
                name: middleware.name || 'anonymous',
            })

            let nextCalled = false

            const next = async () => {
                nextCalled = true
                await dispatch(i + 1)
            }

            try {
                if (middleware.length >= 2) {
                    await middleware(context, next)
                } else {
                    await middleware(context)
                }
            } catch (err) {
                this.#handleMiddlewareError(err, i, middleware, context)
                throw err
            }

            if (!nextCalled && middleware.length >= 2) {
                this.#logger?.debug?.(`${this.constructor.name} Middleware stopped pipeline`, {
                    index: i,
                    name: middleware.name || 'anonymous',
                })
            }

            this.#logger?.debug?.(`${this.constructor.name} Middleware exit`, {
                index: i,
                name: middleware.name || 'anonymous',
            })
        }

        await dispatch(0)
    }

    /**
     *
     */
    clear() {
        this.#assertAlive()
        this.#middlewares.clear()
        this.#logger?.warn?.(`${this.constructor.name} MiddlewarePipeline cleared`)
    }

    /**
     *
     * @returns
     */
    destroy() {
        if (this.#isDestroyed) return

        this.#middlewares.clear()
        this.#isDestroyed = true

        this.#logger?.info?.(`${this.constructor.name} MiddlewarePipeline destroyed`)
    }

    /* ===============================
     * Internal helpers
     * =============================== */

    #assertAlive() {
        if (this.#isDestroyed) {
            const err = new Error(`${this.constructor.name} MiddlewarePipeline is destroyed`)
            this.#logger?.error?.(err.message)
            throw err
        }
    }

    #assertMiddleware(fn) {
        if (typeof fn !== 'function') {
            throw new TypeError(`${this.constructor.name} Middleware must be a function`)
        }
    }

    #assertContext(ctx) {
        if (ctx === null || typeof ctx !== 'object') {
            throw new TypeError(`${this.constructor.name} Context must be an object`)
        }
    }

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
