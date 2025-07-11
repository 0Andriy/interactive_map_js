/**
 * Значення за замовчуванням для максимальної кількості обробників.
 * @type {number}
 */
const defaultMaxListeners = 10

/**
 * @class EventEmitter
 * @description Максимально повна реалізація патерну "Опублікуй-Підпишись", що імітує поведінку
 * стандартного EventEmitter з Node.js, включаючи спеціальні події та контроль ліміту обробників.
 */
class EventEmitter {
    /**
     * Приватне сховище для обробників подій.
     * @private
     * @type {Map<string, Function[]>}
     */
    #listeners = new Map()

    /**
     * Приватне поле, що зберігає максимальну кількість обробників.
     * @private
     * @type {number}
     */
    #maxListeners = defaultMaxListeners

    /**
     * Допоміжний приватний метод для додавання обробників.
     * @private
     * @param {string} eventName Назва події.
     * @param {Function} listener Функція-обробник.
     * @param {boolean} prepend Чи додавати обробник на початок масиву.
     * @returns {this} Повертає поточний екземпляр для ланцюгового виклику.
     */
    #addListener(eventName, listener, prepend) {
        if (this.#listeners.has('newListener')) {
            this.emit('newListener', eventName, listener)
        }

        if (!this.#listeners.has(eventName)) {
            this.#listeners.set(eventName, [])
        }

        const listenersArray = this.#listeners.get(eventName)
        if (prepend) {
            listenersArray.unshift(listener)
        } else {
            listenersArray.push(listener)
        }

        if (listenersArray.length > this.#maxListeners && this.#maxListeners > 0) {
            console.warn(
                `Warning: Possible memory leak. Added ${listenersArray.length} ` +
                    `listeners for event '${eventName}'. Increase the limit or ` +
                    `check your code.`,
            )
        }
        return this
    }

    /**
     * Додає обробник події.
     * @param {string} eventName Назва події.
     * @param {Function} listener Функція, що буде викликана.
     * @returns {this}
     */
    on(eventName, listener) {
        return this.#addListener(eventName, listener, false)
    }

    /**
     * Псевдонім для методу `on`.
     * @param {string} eventName Назва події.
     * @param {Function} listener Функція-обробник.
     * @returns {this}
     */
    addListener(eventName, listener) {
        return this.on(eventName, listener)
    }

    /**
     * Додає обробник на початок масиву.
     * @param {string} eventName Назва події.
     * @param {Function} listener Функція-обробник.
     * @returns {this}
     */
    prependListener(eventName, listener) {
        return this.#addListener(eventName, listener, true)
    }

    /**
     * Додає обробник, який буде викликаний лише один раз.
     * @param {string} eventName Назва події.
     * @param {Function} callback Функція, що буде викликана один раз.
     * @returns {this}
     */
    once(eventName, callback) {
        const wrapper = (...args) => {
            this.off(eventName, wrapper)
            callback(...args)
        }
        return this.on(eventName, wrapper)
    }

    /**
     * Додає обробник, який буде викликаний лише один раз, на початок масиву.
     * @param {string} eventName Назва події.
     * @param {Function} listener Функція, що буде викликана один раз.
     * @returns {this}
     */
    prependOnceListener(eventName, listener) {
        const wrapper = (...args) => {
            this.off(eventName, wrapper)
            listener(...args)
        }
        return this.prependListener(eventName, wrapper)
    }

    /**
     * Видаляє обробник події.
     * @param {string} eventName Назва події.
     * @param {Function} listener Функція, яку потрібно видалити.
     * @returns {this}
     */
    off(eventName, listener) {
        const listenersArray = this.#listeners.get(eventName)
        if (!listenersArray) return this

        const initialSize = listenersArray.length

        const newListenersArray = listenersArray.filter((cb) => cb !== listener)

        // Видаляємо ключ події, якщо масив обробників став порожнім
        if (newListenersArray.length === 0) {
            this.#listeners.delete(eventName)
        } else {
            this.#listeners.set(eventName, newListenersArray)
        }

        if (newListenersArray.length < initialSize) {
            this.emit('removeListener', eventName, listener)
        }
        return this
    }

    /**
     * Псевдонім для методу `off`.
     * @param {string} eventName Назва події.
     * @param {Function} listener Функція, яку потрібно видалити.
     * @returns {this}
     */
    removeListener(eventName, listener) {
        return this.off(eventName, listener)
    }

    /**
     * Випромінює (запускає) подію, викликаючи всіх зареєстрованих обробників.
     * @param {string} eventName Назва події.
     * @param {...any} args Аргументи, які будуть передані обробникам.
     * @returns {boolean} Повертає `true`, якщо було викликано хоча б один обробник.
     */
    emit(eventName, ...args) {
        if (eventName === 'error' && !this.#listeners.has('error')) {
            const error =
                args[0] instanceof Error ? args[0] : new Error(`Unknown error: ${args[0]}`)
            throw error
        }

        const listenersArray = this.#listeners.get(eventName)
        if (listenersArray) {
            const listeners = [...listenersArray]
            for (const callback of listeners) {
                callback(...args)
            }
            return true
        }
        return false
    }

    /**
     * Видаляє всі обробники для конкретної події або для всіх подій.
     * @param {string} [eventName] Необов'язкова назва події.
     * @returns {this}
     */
    removeAllListeners(eventName) {
        if (eventName) {
            const listenersArray = this.#listeners.get(eventName)
            if (listenersArray) {
                listenersArray.forEach((listener) =>
                    this.emit('removeListener', eventName, listener),
                )
                this.#listeners.delete(eventName)
            }
        } else {
            this.#listeners.clear()
        }
        return this
    }

    /**
     * Повертає кількість обробників для конкретної події.
     * @param {string} eventName Назва події.
     * @returns {number} Кількість обробників.
     */
    listenerCount(eventName) {
        const listenersArray = this.#listeners.get(eventName)
        return listenersArray ? listenersArray.length : 0
    }

    /**
     * Повертає копію масиву обробників для конкретної події.
     * @param {string} eventName Назва події.
     * @returns {Function[]} Масив функцій.
     */
    listeners(eventName) {
        const listenersArray = this.#listeners.get(eventName)
        return listenersArray ? [...listenersArray] : []
    }

    /**
     * Встановлює максимальну кількість обробників для всіх подій.
     * @param {number} n Максимальна кількість.
     * @returns {this}
     */
    setMaxListeners(n) {
        if (typeof n !== 'number' || n < 0) {
            throw new TypeError('Max listeners must be a non-negative number.')
        }
        this.#maxListeners = n
        return this
    }

    /**
     * Повертає поточну максимальну кількість обробників.
     * @returns {number}
     */
    getMaxListeners() {
        return this.#maxListeners
    }
}
