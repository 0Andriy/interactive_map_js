/**
 * @fileoverview Повна та надійна реалізація патерну Спостерігача (Observer Pattern),
 * що імітує функціонал Node.js EventEmitter.
 */

/**
 * Клас AdvanceEmitter реалізує брокера подій, що дозволяє компонентам
 * спілкуватися між собою через події без прямої залежності,
 * з додатковими функціями надійності та контролю.
 * @implements {IPubSub} // Якщо ви використовуєте файл інтерфейсів з попередніх прикладів
 */
class AdvanceEmitter {
    constructor() {
        /**
         * Сховище слухачів подій. Використовуємо Map для кращої продуктивності та безпеки ключів.
         * Ключі – назви подій (топіки), значення – масиви функцій зворотного виклику.
         * @type {Map<string, Array<Function>>}
         */
        this.listeners = new Map()

        /**
         * Максимальна кількість слухачів за замовчуванням перед видачею попередження.
         * @type {number}
         */
        this.maxListeners = 10
    }

    /**
     * Перевіряє, чи не перевищено ліміт слухачів, і попереджає про це.
     * Цей метод є внутрішнім (приватним).
     * @private
     * @param {string} eventName Назва події для перевірки.
     */
    _checkMaxListeners(eventName) {
        const count = this.listeners.get(eventName)?.length || 0
        if (count > this.maxListeners) {
            console.warn(
                `[AdvanceEmitter] Увага: Можливий витік пам'яті. Додано більше ${this.maxListeners} слухачів для події "${eventName}". Використовуйте setMaxListeners() для збільшення ліміту.`,
            )
        }
    }

    /**
     * Додає нового постійного слухача для вказаної події (еквівалент 'on' або 'addListener').
     * @param {string} eventName Назва події (наприклад, 'user:created').
     * @param {Function} listener Функція зворотного виклику (слухач).
     * @returns {this} Повертає поточний екземпляр Emitter для ланцюгових викликів (chaining).
     * @throws {TypeError} Якщо listener не є функцією.
     */
    on(eventName, listener) {
        if (typeof listener !== 'function') {
            throw new TypeError('Listener повинен бути функцією')
        }

        if (!this.listeners.has(eventName)) {
            this.listeners.set(eventName, [])
        }

        this.listeners.get(eventName).push(listener)
        this._checkMaxListeners(eventName)
        return this
    }

    /**
     * Те саме, що й 'on', але додає слухача на початок списку слухачів,
     * гарантуючи його виконання першим.
     * @param {string} eventName Назва події.
     * @param {Function} listener Функція зворотного виклику.
     * @returns {this} Повертає поточний екземпляр Emitter.
     * @throws {TypeError} Якщо listener не є функцією.
     */
    prependListener(eventName, listener) {
        if (typeof listener !== 'function') {
            throw new TypeError('Listener повинен бути функцією')
        }

        if (!this.listeners.has(eventName)) {
            this.listeners.set(eventName, [])
        }

        this.listeners.get(eventName).unshift(listener)
        this._checkMaxListeners(eventName)
        return this
    }

    /**
     * Синонім для методу on().
     * @alias on
     */
    addListener(eventName, listener) {
        return this.on(eventName, listener)
    }

    /**
     * Додає слухача, який спрацює лише один раз при першому виклику події, після чого буде видалений.
     * @param {string} eventName Назва події.
     * @param {Function} listener Функція зворотного виклику.
     * @returns {this} Повертає поточний екземпляр Emitter.
     */
    once(eventName, listener) {
        const wrapper = (...args) => {
            listener.apply(this, args)
            this.removeListener(eventName, wrapper)
        }
        // Зберігаємо посилання на оригінальний слухач для коректного видалення
        wrapper.originalListener = listener
        this.on(eventName, wrapper)
        return this
    }

    /**
     * Синхронно викликає всіх зареєстрованих слухачів для вказаної події.
     * @param {string} eventName Назва події.
     * @param {...any} args Аргументи (дані), які будуть передані кожному слухачу.
     * @returns {boolean} True, якщо були зареєстровані слухачі для цієї події, інакше False.
     * @throws {Error} Якщо викликано подію 'error', а слухачів немає (поведінка Node.js за замовчуванням).
     */
    emit(eventName, ...args) {
        const handlers = this.listeners.get(eventName)

        if (!handlers || handlers.length === 0) {
            // Спеціальна логіка обробки помилок Node.js:
            // якщо є помилка, але немає обробника, програма аварійно завершується.
            if (eventName === 'error') {
                const error = args[0]
                console.error('[FATAL ERROR] Неперехоплена помилка EventEmitter:', error)
                throw error
            }
            return false
        }

        // Виконуємо копію масиву для безпечної ітерації (запобігає проблемам, якщо слухач видаляє себе під час emit)
        ;[...handlers].forEach((listener) => {
            try {
                // Використання apply передає аргументи як масив, зберігаючи контекст this
                listener.apply(this, args)
            } catch (error) {
                // Якщо слухач кидає помилку, ми її ловимо і обробляємо як нову подію 'error'
                console.error(
                    `Помилка під час виконання слухача події "${eventName}". Перенаправлення на подію 'error'.`,
                    error,
                )
                this.emit('error', error)
            }
        })

        return true
    }

    /**
     * Видаляє конкретний слухач для події.
     * @param {string} eventName Назва події.
     * @param {Function} listener Функція зворотного виклику, яку потрібно видалити.
     * @returns {this} Повертає поточний екземпляр Emitter.
     */
    removeListener(eventName, listener) {
        const handlers = this.listeners.get(eventName)
        if (!handlers) return this

        // Фільтруємо, враховуючи також обгортки once()
        this.listeners.set(
            eventName,
            handlers.filter(
                (handler) => handler !== listener && handler.originalListener !== listener,
            ),
        )

        if (this.listeners.get(eventName).length === 0) {
            this.listeners.delete(eventName)
        }
        return this
    }

    /**
     * Синонім для методу removeListener().
     * @alias removeListener
     */
    off(eventName, listener) {
        return this.removeListener(eventName, listener)
    }

    /**
     * Видаляє всі слухачі для вказаної події або для всіх подій, якщо eventName не вказано.
     * @param {string} [eventName] Опціонально: назва події для очищення.
     * @returns {this} Повертає поточний екземпляр Emitter.
     */
    removeAllListeners(eventName) {
        if (eventName) {
            this.listeners.delete(eventName)
        } else {
            this.listeners.clear()
        }
        return this
    }

    /**
     * Встановлює максимальну кількість слухачів, перш ніж буде видано попередження.
     * @param {number} n Новий ліміт.
     * @returns {this} Повертає поточний екземпляр Emitter.
     * @throws {TypeError} Якщо n не є додатним числом.
     */
    setMaxListeners(n) {
        if (typeof n !== 'number' || n < 0) {
            throw new TypeError('Ліміт слухачів має бути додатним числом')
        }
        this.maxListeners = n
        return this
    }

    /**
     * Повертає поточну максимальну кількість слухачів.
     * @returns {number} Поточний ліміт.
     */
    getMaxListeners() {
        return this.maxListeners
    }

    /**
     * Повертає кількість слухачів для певної події.
     * @param {string} eventName Назва події.
     * @returns {number} Кількість активних слухачів.
     */
    listenerCount(eventName) {
        return this.listeners.get(eventName)?.length || 0
    }
}

// Експортуємо клас для використання
export default AdvanceEmitter
