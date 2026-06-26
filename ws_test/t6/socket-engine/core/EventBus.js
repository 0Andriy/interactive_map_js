import util from 'util'

/**
 * Оптимізована та безпечна шина подій (Event Bus) для внутрішньої комунікації.
 * Захищена від падіння процесу при помилках у коллбеках та оптимізована через Set.
 */
export class EventBus {
    /**
     * Створює екземпляр EventBus.
     * @param {object} [options] - Додаткові опції.
     * @param {any} [options.logger] - Опціональний логер для відстеження помилок у підписниках.
     */
    constructor(options = {}) {
        /** @type {Map<string, Set<Function>>} Хранилище подій та унікальних підписників */
        this.listeners = new Map()

        const baseLogger = options.logger
        this.logger = baseLogger?.child?.({ component: '[WS EventBus]' }) ??
            baseLogger ?? {
                error: console.error,
                debug: () => {},
            }
    }

    /**
     * Підписує функцію-коллбек на конкретну подію.
     * @param {string} event - Назва подій.
     * @param {Function} callback - Функція, яка буде викликана при еміті.
     */
    on(event, callback) {
        if (typeof event !== 'string' || typeof callback !== 'function') return

        // Оптимізація: отримуємо пряме посилання на Set
        let eventListeners = this.listeners.get(event)
        if (!eventListeners) {
            eventListeners = new Set()
            this.listeners.set(event, eventListeners)
        }

        // Set автоматично гарантує, що один і той самий коллбек не додасться двічі
        eventListeners.add(callback)
    }

    /**
     * Підписує функцію на подію лише ОДИН раз. Після першого виклику підписка автоматично видаляється.
     * @param {string} event - Назва події.
     * @param {Function} callback - Функція обробника.
     */
    once(event, callback) {
        if (typeof event !== 'string' || typeof callback !== 'function') return

        const onceWrapper = (...args) => {
            this.off(event, onceWrapper)
            callback(...args)
        }

        // Зберігаємо посилання на оригінальний коллбек, щоб його можна було видалити через off(event, originalCallback)
        onceWrapper.originalCallback = callback
        this.on(event, onceWrapper)
    }

    /**
     * Тригерить подію та викликає всі підписані коллбеки з переданими аргументами.
     * @param {string} event - Назва події.
     * @param {...any} args - Аргументи, які будуть передані в кожен коллбек.
     */
    emit(event, ...args) {
        if (typeof event !== 'string') return

        const eventListeners = this.listeners.get(event)
        if (!eventListeners || eventListeners.size === 0) return

        // БЕЗПЕЧНИЙ ЛОГ: трансформуємо аргументи через util.inspect
        const inspectedArgs = util.inspect(args, { depth: 2, colors: false, compact: true })
        this.logger?.debug?.(`Еміт події: "${event}" з аргументами: ${inspectedArgs}`)

        // Створюємо копію Set перед ітерацією, щоб уникнути багів,
        // якщо коллбек всередині себе викликає off() для цієї ж події.
        for (const callback of Array.from(eventListeners)) {
            try {
                callback(...args)
            } catch (error) {
                // ЗАХИСТ: помилка в одному підписнику не ламає виконання інших підписників і не "впускає" сервер
                this.logger?.error?.(`[Error] Помилка в обробнику події "${event}":`, error)
            }
        }
    }

    /**
     * Видаляє підписку.
     * Якщо callback передано — видаляє конкретний обробник.
     * Якщо callback НЕ передано — видаляє ВСІХ підписників з цієї події.
     * @param {string} event - Назва події.
     * @param {Function} [callback] - Конкретний коллбек, який треба видалити.
     */
    off(event, callback) {
        if (typeof event !== 'string') return

        // Сценарій 1: Видаляємо взагалі всіх підписників з цієї події (як було у вашому коді)
        if (!callback) {
            this.listeners.delete(event)
            return
        }

        // Сценарій 2: Оптимізоване видалення конкретного підписника
        const eventListeners = this.listeners.get(event)
        if (!eventListeners) return

        // Перевіряємо як пряме посилання, так і обгортки від .once()
        for (const listener of eventListeners) {
            if (listener === callback || listener.originalCallback === callback) {
                eventListeners.delete(listener)
            }
        }

        // Якщо підписників більше немає, видаляємо саму подію з Map, щоб не споживати пам'ять
        if (eventListeners.size === 0) {
            this.listeners.delete(event)
        }
    }
}
