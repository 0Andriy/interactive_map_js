import { BroadcastOperator } from './BroadcastOperator.js'

/**
 * Клас простору імен (Namespace), аналог Namespace із Socket.IO.
 * Оркеструє підключені сокети, керує асинхронними Middleware для авторизації,
 * володіє інстансом адаптера та координує глобальну розсилку (бродкаст).
 */
export class Namespace {
    /**
     * Створює екземпляр Namespace.
     * @param {string} name - Назва простору імен (наприклад, '/' або '/chat').
     * @param {object|null} [logger=null] - Опціональний екземпляр логера.
     */
    constructor(name, logger = null) {
        if (typeof name !== 'string' || !name) {
            throw new TypeError('Namespace name must be a non-empty string.')
        }

        /**
         * Назва простору імен.
         * @type {string}
         * @public
         */
        this.name = name.startsWith('/') ? name : `/${name}`

        /**
         * Мапа живих локальних сокетів, підключених до цього простору імен (socketId -> Socket).
         * @type {Map<string, object>}
         * @public
         */
        this.sockets = new Map()

        /**
         * Поточний адаптер для керування кімнатами та бродкастом.
         * Ініціалізується через Server Factory за допомогою io.adapter().
         * @type {object|null}
         * @public
         */
        this.adapter = null

        /**
         * Екземпляр логера з дочірнім контекстом для цього простору імен.
         * @type {object|null}
         * @protected
         */
        this.logger = logger?.child?.({ component: `[Namespace: ${this.name}]` }) ?? logger ?? null

        /**
         * Черга зареєстрованих функцій проміжної обробки (Middleware).
         * @type {Function[]}
         * @private
         */
        this.fns = []
    }

    /**
     * Реєструє нову функцію проміжної обробки (Middleware) для валідації або авторизації з'єднань.
     * Аналог: io.use((socket, next) => { ... })
     * @param {Function} fn - Функція middleware з сигнатурою (socket, next).
     * @returns {this} Повертає цей же інстанс для ланцюжка викликів (Chaining).
     */
    use(fn) {
        if (typeof fn === 'function') {
            this.fns.push(fn)
        } else if (this.logger?.warn) {
            this.logger.warn('Namespace.use() expects a function as an argument.')
        }
        return this
    }

    /**
     * Починає ланцюжок розсилки (бродкасту) від імені самого сервера у вказану кімнату.
     * Аналог: io.to('room').emit()
     * @param {string} room - Назва кімнати.
     * @returns {BroadcastOperator} Оператор побудови ланцюжка бродкасту.
     */
    to(room) {
        if (!this.adapter) {
            this._handleError(
                'adapter_missing',
                new Error('Adapter is not initialized on this Namespace.'),
            )
        }
        return new BroadcastOperator(this.adapter).to(room)
    }

    /**
     * Синонім методу .to(), повністю сумісний із Socket.IO API.
     * @param {string} room - Назва кімнати.
     * @returns {BroadcastOperator}
     */
    in(room) {
        return this.to(room)
    }

    /**
     * Реєструє та інтегрує новий об'єкт сокета, попередньо проганяючи його через ланцюжок Middleware.
     * Якщо хоча б одне middleware повертає помилку, сокет відхиляється.
     * @param {object} socketInstance - Свіжостворений екземпляр класу Socket.
     * @returns {void}
     */
    addSocket(socketInstance) {
        if (!socketInstance || typeof socketInstance.id !== 'string' || !socketInstance.id) {
            return
        }

        // Асинхронно проганяємо сокет через чергу зареєстрованих middleware
        this._runMiddleware(socketInstance, (err) => {
            if (err) {
                this._handleError(`middleware_rejected:[${socketInstance.id}]`, err)

                // Надсилаємо клієнту пакет помилки підключення (connect_error за специфікацією)
                if (typeof socketInstance.sendPacket === 'function') {
                    socketInstance.sendPacket({
                        type: 'connect_error',
                        message: err.message || 'Authentication error',
                        data: err.data || null,
                    })
                }

                // Жорстко розриваємо з'єднання
                if (typeof socketInstance.disconnect === 'function') {
                    socketInstance.disconnect()
                }
                return
            }

            // --- УСПІШНЕ ПІДКЛЮЧЕННЯ (Аналог події 'connection') ---
            this.sockets.set(socketInstance.id, socketInstance)

            if (this.logger?.debug) {
                this.logger.debug(
                    `Сокет ${socketInstance.id} успішно авторизований та доданий до простору імен.`,
                )
            }

            // Якщо сокет має кастомний метод еміту події підключення всередину своєї логіки, його можна викликати тут
            socketInstance.emit('connect_success', { nsp: this.name })
        })
    }

    /**
     * Внутрішній рекурсивний ітератор, який послідовно виконує чергу middleware.
     * @param {object} socketInstance - Екземпляр класу Socket.
     * @param {Function} callback - Фінальний коллбек (err) => { ... }.
     * @private
     */
    _runMiddleware(socketInstance, callback) {
        const fns = this.fns
        const len = fns.length
        if (len === 0) return callback(null) // Якщо middleware немає — одразу пускаємо клієнта

        let index = 0

        /**
         * Функція керування ланцюжком (next). Передається в користувацьке middleware.
         * @param {Error|any} [err] - Об'єкт помилки, якщо авторизацію провалено.
         */
        const next = (err) => {
            if (err) return callback(err) // Зупиняємо ланцюжок при першій же помилці

            if (index >= len) return callback(null) // Успішно пройшли всі шари

            const currentMiddleware = fns[index++]
            try {
                currentMiddleware(socketInstance, next)
            } catch (catchError) {
                // ЗАХИСТ: якщо всередині коду самого middleware сталася рантайм-помилка — відловлюємо її
                callback(catchError)
            }
        }

        next() // Запуск першого шару
    }

    /**
     * Внутрішній метод, який викликається сокетом при його закритті/дисконекті.
     * Видаляє сокет з локальної мапи та асинхронно чистить його кімнати в адаптері.
     * @param {object} socketInstance - Екземпляр класу Socket, що відключився.
     * @internal
     */
    _removeSocket(socketInstance) {
        if (!socketInstance || !socketInstance.id) return

        const id = socketInstance.id
        if (this.sockets.has(id)) {
            this.sockets.delete(id)

            if (this.adapter && typeof this.adapter.delAll === 'function') {
                // Асинхронно очищаємо всі кімнати в адаптері (InMemory або Redis)
                this.adapter.delAll(id).catch((error) => {
                    this._handleError(`adapter_delAll_failed:[${id}]`, error)
                })
            }

            if (this.logger?.debug) {
                this.logger.debug(
                    `Сокет ${id} видалено з простору імен та очищено з усіх кімнат адаптера.`,
                )
            }
        }
    }

    /**
     * Уніфікований внутрішній метод для безпечного логування та обробки помилок простору імен.
     * @param {string} context - Контекст або назва операції, де сталася помилка.
     * @param {Error|any} error - Об'єкт помилки.
     * @internal
     */
    _handleError(context, error) {
        if (this.logger && typeof this.logger.error === 'function') {
            this.logger.error(`Error in context "${context}":`, error)
        } else {
            console.error(`[Namespace Error][${this.name}] Context: "${context}":`, error)
        }
    }
}
