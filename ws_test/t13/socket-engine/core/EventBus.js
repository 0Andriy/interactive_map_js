/**
 * Оптимізована, безпечна та сумісна з EventEmitter/PubSub шина подій (Event Bus).
 * Захищена від падіння процесу при помилках у колбеках та оптимізована через Set.
 */
export class EventBus {
    /**
     * Створює екземпляр EventBus.
     * @param {object} [options] - Додаткові опції.
     * @param {any} [options.logger] - Опціональний логер для відстеження роботи та помилок.
     * @param {number} [options.maxListeners=10] - Максимальна кількість підписників на одну подію.
     */
    constructor(options = {}) {
        /** @type {Map<string, Set<Function>>} Сховище подій та унікальних підписників */
        this.listeners = new Map()

        /** @type {Map<Function, Function>} Зворотне сховище для обгорток .once() */
        this.onceWrappers = new Map()

        /** @type {number} Максимальний ліміт слухачів на одну подію */
        this.maxListeners = options.maxListeners ?? 10

        const baseLogger = options.logger
        this.logger = baseLogger?.child?.({ component: '[WS EventBus]' }) ??
            baseLogger ?? {
                warn: console.warn,
                error: console.error,
            }

        // --- СИНОНІМИ ДЛЯ ПОВНОЇ СУМІСНОСТІ ---

        // Налаштовуємо синоніми через явне зв'язування з контекстом поточного екземпляра.
        // Це гарантує стабільну роботу навіть при деструктуризації: const { emit } = eventBus;
        this.on = this.on.bind(this)
        this.once = this.once.bind(this)
        this.emit = this.emit.bind(this)
        this.off = this.off.bind(this)
        this.removeAllListeners = this.removeAllListeners.bind(this)
        this.listenerCount = this.listenerCount.bind(this)

        // ДИНАМІЧНІ СИНОНІМИ (Завжди вказують на актуальні методи, захищені від перевизначення в підкласах)
        this.addListener = this.on
        this.removeListener = this.off
        this.subscribe = this.on
        this.unsubscribe = this.off
        this.publish = this.emit
        this.trigger = this.emit
        this.listen = this.on
    }

    /**
     * Підписує функцію-колбек на конкретну подію.
     * @param {string} event - Назва події.
     * @param {Function} callback - Функція, яка буде викликана при еміті.
     * @returns {EventBus} Повертає `this` для підтримки чейнінгу (chaining).
     */
    on(event, callback) {
        if (typeof event !== 'string' || typeof callback !== 'function') return this

        const eventName = String(event).trim()
        if (!eventName) return this

        let eventListeners = this.listeners.get(eventName)
        if (!eventListeners) {
            eventListeners = new Set()
            this.listeners.set(eventName, eventListeners)
        }

        if (eventListeners.size >= this.maxListeners && !eventListeners.has(callback)) {
            this.logger?.warn?.(
                `[EventBus Warning] Виявлено можливий виток пам'яті. Подія "${eventName}" має більше ніж ${this.maxListeners} підписників.`,
            )
        }

        eventListeners.add(callback)
        return this
    }

    /**
     * Підписує функцію на подію лише ОДИН раз. Після першого виклику підписка автоматично видаляється.
     * @param {string} event - Назва події.
     * @param {Function} callback - Функція обробника.
     * @returns {EventBus}
     */
    once(event, callback) {
        if (typeof event !== 'string' || typeof callback !== 'function') return this

        const eventName = String(event).trim()
        if (!eventName) return this

        // Створюємо ізольовану обгортку, яка сама себе видалить
        const onceWrapper = (...args) => {
            this.off(eventName, callback)
            try {
                callback(...args)
            } catch (error) {
                this.logger?.error?.(`Помилка в "once" обробнику події "${eventName}":`, error)
            }
        }

        this.onceWrappers.set(callback, onceWrapper)
        this.on(eventName, onceWrapper)
        return this
    }

    /**
     * Тригерить подію та викликає всі підписані колбеки з переданими аргументами.
     * @param {string} event - Назва події.
     * @param {...any} args - Аргументи, які будуть передані в кожен колбек.
     * @returns {boolean} Повертає true, якщо подія мала підписників, інакше false.
     */
    emit(event, ...args) {
        if (typeof event !== 'string') return false

        const eventName = String(event).trim()

        const eventListeners = this.listeners.get(eventName)
        if (!eventListeners || eventListeners.size === 0) return false

        // Створюємо копію масиву слухачів.
        // Це захищає від нескінченних циклів, якщо всередині колбеку викличеться .on() або .once() на цю ж подію
        const listenersCopy = Array.from(eventListeners)

        for (const callback of listenersCopy) {
            try {
                callback(...args)
            } catch (error) {
                // ЗАХИСТ: помилка в одному підписнику не блокує виконання інших сервісів
                this.logger?.error?.(`Помилка в обробнику події "${eventName}":`, error)
            }
        }
        return true
    }

    /**
     * Видаляє підписку (конкретну або всі для події).
     * @param {string} event - Назва події.
     * @param {Function} [callback] - Конкретний колбек, який треба видалити.
     * @returns {EventBus}
     */
    off(event, callback) {
        if (typeof event !== 'string') return this

        const eventName = String(event).trim()

        // Якщо колбек не передано — видаляємо абсолютно всі підписки на цю подію
        if (!callback) {
            // Очищаємо onceWrappers для слухачів цієї події, щоб уникнути витоку пам'яті
            const eventListeners = this._listeners.get(eventName)
            if (eventListeners) {
                for (const cb of eventListeners) {
                    this.onceWrappers.delete(cb)
                }
            }

            this.listeners.delete(eventName)
            return this
        }

        const eventListeners = this.listeners.get(eventName)
        if (!eventListeners) return this

        // Визначаємо, що видаляти: саму функцію чи її .once() обгортку
        const targetListener = this.onceWrappers.get(callback) ?? callback

        eventListeners.delete(targetListener)
        this.onceWrappers.delete(callback)

        // Якщо підписників на подію не залишилось — видаляємо саму подію з Map
        if (eventListeners.size === 0) {
            this.listeners.delete(eventName)
        }
        return this
    }

    /**
     * Видаляє всіх підписників для конкретної події або взагалі всі підписки, якщо аргумент відсутній.
     * @param {string} [event] - Назва події.
     * @returns {EventBus}
     */
    removeAllListeners(event) {
        if (event) {
            this.off(event) // Делегуємо очищення в off для безпечного очищення onceWrappers
        } else {
            this.listeners.clear()
            this.onceWrappers.clear()
        }
        return this
    }

    /**
     * Повертає кількість підписників на певну подію.
     * @param {string} event - Назва події.
     * @returns {number}
     */
    listenerCount(event) {
        if (!event) return 0

        const eventName = String(event).trim()
        return this.listeners.get(eventName)?.size ?? 0
    }
}
