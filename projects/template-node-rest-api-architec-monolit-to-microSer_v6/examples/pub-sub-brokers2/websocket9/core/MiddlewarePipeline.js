/**
 * MiddlewarePipeline
 * Клас для послідовного виконання асинхронних функцій (middleware).
 * Реалізує патерн "Onion Architecture" (цибулева архітектура).
 * Кожен middleware отримує контекст і функцію next для виклику наступного middleware.
 */
export class MiddlewarePipeline {
    /**
     * @param {Object} options
     * @param {Object} [options.logger] - Інстанс логера для відстеження виконання.
     * @example
     * const runner = new MiddlewarePipeline ({ logger })
     */
    constructor(options = {}) {
        /** Масив зареєстрованих middleware функцій
         * @type {Function[]}
         */
        this.middlewares = []

        /** Інстанс логера
         * @type {Object|null}
         */
        this.logger = options.logger || null
    }

    /**
     * Реєструє новий middleware у ланцюжку.
     * @param {Function} fn - Функція вигляду (context, next) => Promise<void> | void.
     * @returns {MiddlewarePipeline } Повертає екземпляр класу для chaining.
     * @throws {TypeError} Якщо переданий аргумент не є функцією.
     * @example
     * runner.use(async (ctx, next) => {
     *     // Логіка middleware
     *     await next() // Виклик наступного middleware
     *
     *     // Після повернення з наступного middleware
     *     console.log('Middleware completed')
     * })
     */
    use(fn) {
        if (typeof fn !== 'function') {
            throw new TypeError(`[${this.constructor.name}] Middleware must be a function`)
        }

        this.middlewares.push(fn)

        return this
    }

    // /**
    //  * Запускає виконання ланцюжка middleware (recursive stack).
    //  * Можуть бути проблеми зі стеком при великій кількості middleware.
    //  * @param {Object} context - Об'єкт стану, що передається через усі middleware.
    //  * @returns {Promise<Object>} Оброблений об'єкт контексту.
    //  * @throws {Error} Прокидає помилку, якщо будь-який middleware дає збій.
    //  * @example
    //  * const resultContext = await runner.execute({ userId: 123 })
    //  */
    // async execute(context = {}) {
    //     let index = -1

    //     /**
    //      * Рекурсивна функція для ітерації по масиву middleware.
    //      * @param {number} i - Поточний індекс у ланцюжку.
    //      * @returns {Promise<void>}
    //      */
    //     const dispatch = async (i) => {
    //         // Захист від подвійного виклику next() в одному middleware
    //         if (i <= index) {
    //             throw new Error('next() called multiple times')
    //         }

    //         index = i
    //         const fn = this.middlewares[i]

    //         // Якщо досягнуто кінця ланцюжка
    //         if (!fn) return

    //         try {
    //             // Виклик поточного middleware з передачею контексту та посилання на наступний крок
    //             await fn(context, () => dispatch(i + 1))
    //         } catch (error) {
    //             this.logger?.error?.(`[${this.constructor.name}] Middleware execution error`, {
    //                 index: i,
    //                 error: error.message,
    //                 middleware: fn.name || `anon#${i}`,
    //             })
    //             throw error
    //         }
    //     }

    //     await dispatch(0)
    //     return context
    // }

    /**
     * Запускає виконання ланцюжка (ітеративний підхід).
     * Захищений від stack overflow при великій кількості middleware.
     * @param {Object} context - Початковий контекст.
     * @returns {Promise<Object>} Оброблений об'єкт контексту.
     * @throws {Error} Прокидає помилку, якщо будь-який middleware дає збій.
     * @example
     * const resultContext = await runner.execute({ userId: 123 })
     */
    async execute(context = {}) {
        // Якщо немає middleware, повертаємо контекст як є
        if (this.middlewares.length === 0) return context

        // Фінальна функція (виконується, коли всі middleware викликали next)
        let next = async () => {}

        // Збираємо ланцюжок "матрьошкою" з кінця до початку (ітеративно)
        for (let i = this.middlewares.length - 1; i >= 0; i--) {
            const currentFn = this.middlewares[i]
            const nextStep = next // Замикаємо наступний крок

            next = async () => {
                let isNextCalled = false

                /**
                 * Функція переходу до наступного middleware
                 */
                const wrappedNext = async () => {
                    if (isNextCalled) {
                        const errorMsg = `next() called multiple times in middleware [${
                            currentFn.name || `anon#${i}`
                        }]`
                        this.logger?.error?.(`[${this.constructor.name}] ${errorMsg}`)
                        throw new Error(errorMsg)
                    }

                    isNextCalled = true
                    return await nextStep()
                }

                try {
                    // Викликаємо поточний middleware, передаючи йому наступний крок
                    const result = currentFn(context, wrappedNext)

                    // ЗАХИСТ 1: Перевірка, чи повернуто Promise (захист від забутого return/await)
                    if (
                        result === undefined ||
                        (result !== null && typeof result.then !== 'function')
                    ) {
                        this.logger?.warn?.(
                            `[${this.constructor.name}] Middleware [${
                                currentFn.name || `anon#${i}`
                            }] did not return a Promise. ` +
                                `Ensure you use 'return next()' or 'await next()'.`,
                        )
                    }

                    // Очікуємо результат (якщо це Promise) захист від забутого await
                    const awaitedResult = await result

                    // ЗАХИСТ 2: Перевірка, чи був викликаний next()
                    if (!isNextCalled && i < this.middlewares.length - 1) {
                        this.logger?.warn?.(
                            `[${this.constructor.name}]Middleware [${
                                currentFn.name || `anon#${i}`
                            }] did not call next(). ` + `This may halt the middleware chain.`,
                        )
                    }

                    return awaitedResult
                } catch (error) {
                    this.logger?.error?.(
                        `[${this.constructor.name}] Error in middleware at index ${i}`,
                        {
                            error: error.message,
                            middleware: currentFn.name || `anon#${i}`,
                        },
                    )

                    throw error // Прокидаємо помилку далі для глобальної обробки
                }
            }
        }

        await next()
        return context
    }

    /**
     * Очищення списку мідлварів.
     * @example
     * runner.clear()
     */
    clear() {
        this.middlewares = []
    }
}
