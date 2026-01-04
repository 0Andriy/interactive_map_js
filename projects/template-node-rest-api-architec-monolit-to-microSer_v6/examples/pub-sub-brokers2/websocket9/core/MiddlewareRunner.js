/**
 * Клас для управління та виконання черги middleware (проміжного ПЗ).
 * Підтримує асинхронні функції, обробку помилок та передачу довільного контексту.
 */
export class MiddlewareRunner {
    /**
     * @param {Object} options
     * @param {Object} [options.logger] - Інстанс логера для відстеження виконання.
     * @example
     * const runner = new MiddlewareRunner({ logger })
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
     * @returns {MiddlewareRunner} Повертає екземпляр класу для chaining.
     * @throws {TypeError} Якщо переданий аргумент не є функцією.
     * @example
     * runner.use(async (ctx, next) => {
     *     // Логіка middleware
     *     await next() // Виклик наступного middleware
     * })
     */
    use(fn) {
        if (typeof fn !== 'function') {
            throw new TypeError('Middleware must be a function')
        }
        this.middlewares.push(fn)
        return this
    }

    /**
     * Запускає виконання ланцюжка middleware.
     * @param {Object} context - Об'єкт стану, що передається через усі middleware.
     * @returns {Promise<Object>} Оброблений об'єкт контексту.
     * @throws {Error} Прокидає помилку, якщо будь-який middleware дає збій.
     * @example
     * const resultContext = await runner.execute({ userId: 123 })
     */
    async execute(context = {}) {
        let index = -1

        /**
         * Рекурсивна функція для ітерації по масиву middleware.
         * @param {number} i - Поточний індекс у ланцюжку.
         * @returns {Promise<void>}
         */
        const dispatch = async (i) => {
            // Захист від подвійного виклику next() в одному middleware
            if (i <= index) {
                throw new Error('next() called multiple times')
            }

            index = i
            const fn = this.middlewares[i]

            // Якщо досягнуто кінця ланцюжка
            if (!fn) return

            try {
                // Виклик поточного middleware з передачею контексту та посилання на наступний крок
                await fn(context, () => dispatch(i + 1))
            } catch (error) {
                if (this.logger) {
                    this.logger.error('Middleware execution error', {
                        index: i,
                        error: error.message,
                        middleware: fn.name || 'anonymous',
                    })
                }
                throw error
            }
        }

        await dispatch(0)
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
