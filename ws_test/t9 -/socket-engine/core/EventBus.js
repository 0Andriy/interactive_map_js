/**
 * Універсальна, безпечна та високопродуктивна шина подій (Event Bus) простий аналог EventEmitter.
 * Повністю повторює ключову логіку та переваги нативного Node.js EventEmitter,
 * але не потребує успадкування, захищена від синхронних/асинхронних помилок
 * та оптимізована для High-Load архітектур (наприклад, WebSockets).
 */
export class EventBus {
    /**
     * Створює екземпляр EventBus.
     * @param {object} [options={}] - Налаштування для шини подій.
     * @param {object|null} [options.logger] - Кастомний екземпляр логера (наприклад, Pino, Winston або console).
     * @param {number} [options.maxListeners=10] - Максимальна кількість підписників на одну подію для запобігання витокам пам'яті. Використовуйте 0 або менше для вимкнення ліміту.
     */
    constructor(options = {}) {
        /**
         * Хранилище подій та масивів активних обробників.
         * @type {Map<string, Function[]>}
         * @private
         */
        this.listeners = new Map()

        /**
         * Карта зв'язків для обгородок одноразових подій (originalCallback -> onceWrappers).
         * Зберігає масиви, оскільки одна й та сама функція може бути підписана через .once() кілька разів.
         * @type {Map<Function, Function[]>}
         * @private
         */
        this.onceWrappers = new Map()

        /**
         * Максимально дозволена кількість слухачів на одну подію.
         * @type {number}
         * @public
         */
        this.maxListeners = options.maxListeners ?? 10

        /**
         * Екземпляр логера з дочірнім контекстом шини, або null, якщо логер відсутній.
         * @type {object|null}
         * @private
         */
        const baseLogger = options.logger
        this.logger = baseLogger?.child?.({ component: '[WS EventBus]' }) ?? baseLogger ?? null
    }

    /**
     * Підписує функцію-коллбек на конкретну подію (додає в кінець черги виконання).
     * @param {string} event - Назва події.
     * @param {Function} callback - Функція обробника події.
     * @returns {void}
     */
    on(event, callback) {
        this._addListener(event, callback, false)
    }

    /**
     * Підписує функцію-коллбек на початок черги виконання (пріоритетний виклик).
     * @param {string} event - Назва події.
     * @param {Function} callback - Функція обробника події.
     * @returns {void}
     */
    prependListener(event, callback) {
        this._addListener(event, callback, true)
    }

    /**
     * Підписує функцію на подію лише на ОДИН виклик.
     * Після першого ж тригеру підписка автоматично видаляється перед викликом обробника.
     * @param {string} event - Назва події.
     * @param {Function} callback - Функція обробника події.
     * @returns {void}
     */
    once(event, callback) {
        if (typeof event !== 'string' || typeof callback !== 'function') return

        /**
         * Обгортка, яка забезпечує одноразовий виклик та перехоплення помилок.
         * @param {...any} args - Аргументи, що передаються в еміт події.
         */
        const onceWrapper = (...args) => {
            this.off(event, callback)

            try {
                const result = callback(...args)
                if (result instanceof Promise) {
                    result.catch((error) => this._handleError(event, error))
                }
            } catch (error) {
                this._handleError(event, error)
            }
        }

        let wrappers = this.onceWrappers.get(callback)
        if (!wrappers) {
            wrappers = []
            this.onceWrappers.set(callback, wrappers)
        }
        wrappers.push(onceWrapper)

        this.on(event, onceWrapper)
    }

    /**
     * Тригерить подію та синхронно викликає всі підписані обробники по черзі.
     * Повністю захищений від падіння процесу при синхронних чи асинхронних помилках у підписниках.
     * @param {string} event - Назва події.
     * @param {...any} args - Аргументи, які будуть передані в кожен обробник.
     * @returns {boolean} Повертає `true`, якщо подія мала активних підписників, інакше `false`.
     */
    emit(event, ...args) {
        if (typeof event !== 'string') return false

        const eventListeners = this.listeners.get(event)
        if (!eventListeners || eventListeners.length === 0) return false

        // Оптимізація логування: не викликаємо серіалізацію об'єктів, якщо дебаг-логер вимкнений
        if (this.logger?.debug) {
            // Перевіряємо, чи є аргументи, щоб уникнути пустого логу
            const formattedArgs =
                args.length > 0
                    ? args
                          .map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : arg))
                          .join(', ')
                    : 'без аргументів'
            this.logger?.debug?.(`Еміт події: "${event}" з аргументами: [${formattedArgs}]`)
        }

        // Поверхневе копіювання масиву захищає від нескінченних циклів або багів,
        // якщо обробник всередині себе видаляє цю ж підписку через .off()
        const listenersCopy = [...eventListeners]
        const len = listenersCopy.length

        for (let i = 0; i < len; i++) {
            const callback = listenersCopy[i]
            try {
                const result = callback(...args)

                // Перехоплення невідловлених помилок з async/await та промісів
                if (result instanceof Promise) {
                    result.catch((error) => this._handleError(event, error))
                }
            } catch (error) {
                // Перехоплення стандартних синхронних помилок
                this._handleError(event, error)
            }
        }

        return true
    }

    /**
     * Видаляє конкретну підписку або повністю очищає подію, якщо коллбек не передано.
     * @param {string} event - Назва події.
     * @param {Function} [callback] - Конкретний обробник події, який потрібно видалити. Якщо відсутній — видаляються всі підписники події.
     * @returns {void}
     */
    off(event, callback) {
        if (typeof event !== 'string') return

        // Сценарій 1: Видаляємо повністю всі підписки на подію
        if (!callback) {
            const eventListeners = this.listeners.get(event)
            if (eventListeners) {
                const len = eventListeners.length
                for (let i = 0; i < len; i++) {
                    this.onceWrappers.delete(eventListeners[i])
                }
            }
            this.listeners.delete(event)
            return
        }

        const eventListeners = this.listeners.get(event)
        if (!eventListeners) return

        // Сценарій 2: Шукаємо та видаляємо конкретний обробник (зважаючи на обгортки .once())
        let targetCallback = callback
        const wrappers = this.onceWrappers.get(callback)

        if (wrappers && wrappers.length > 0) {
            targetCallback = wrappers.shift()
            if (wrappers.length === 0) {
                this.onceWrappers.delete(callback)
            }
        }

        const index = eventListeners.indexOf(targetCallback)
        if (index !== -1) {
            eventListeners.splice(index, 1)
        }

        // Звільняємо пам'ять у мапі, якщо підписників не залишилось
        if (eventListeners.length === 0) {
            this.listeners.delete(event)
        }
    }

    /**
     * Повністю очищає абсолютно ВСІ події та ВСІ підписки у шині подій.
     * Корисно для повного скидання стану компонента або при закритті з'єднань.
     * @returns {void}
     */
    removeAllListeners() {
        this.listeners.clear()
        this.onceWrappers.clear()
    }

    /**
     * Повертає поточну кількість підписників на вказану подію.
     * @param {string} event - Назва події.
     * @returns {number} Кількість активних обробників події.
     */
    listenerCount(event) {
        return this.listeners.get(event)?.length ?? 0
    }

    /**
     * Внутрішній метод для уніфікованого додавання слухачів з валідацією та логуванням лімітів.
     * @param {string} event - Назва події.
     * @param {Function} callback - Обробник події.
     * @param {boolean} prepend - Флаг, чи додавати на початок масиву (true) чи в кінець (false).
     * @private
     */
    _addListener(event, callback, prepend) {
        if (typeof event !== 'string' || typeof callback !== 'function') return

        let eventListeners = this.listeners.get(event)
        if (!eventListeners) {
            eventListeners = []
            this.listeners.set(event, eventListeners)
        }

        // Перевірка на потенційний витік пам'яті (ідентично нативному MaxListenersExceededWarning)
        if (this.maxListeners > 0 && eventListeners.length >= this.maxListeners) {
            this.logger?.warn?.(
                `Warning: EventBus MaxListenersExceededWarning: Possible EventBus memory leak detected. ` +
                    `${eventListeners.length + 1} "${event}" listeners added. Use options.maxListeners to increase limit.`,
            )
        }

        if (prepend) {
            eventListeners.unshift(callback)
        } else {
            eventListeners.push(callback)
        }
    }

    /**
     * Внутрішній метод для безпечного відловлювання помилок та їх маршрутизації у логер.
     * @param {string} event - Назва події, де сталася помилка.
     * @param {Error|any} error - Об'єкт помилки.
     * @private
     */
    _handleError(event, error) {
        this.logger?.error?.(`[Error] Помилка в обробнику події "${event}":`, error)
    }
}
