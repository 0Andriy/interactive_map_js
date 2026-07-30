/**
 * Легка та швидка реалізація шини подій для забезпечення слабкої зв'язаності.
 */
export class MiniEventEmitter {
    constructor() {
        /** @private @type {Map<string, Set<Function>>} */
        this._events = new Map()
    }

    /**
     * Підписка на подію.
     * @param {string} event
     * @param {Function} fn
     */
    on(event, fn) {
        let listeners = this._events.get(event)
        if (!listeners) {
            listeners = new Set()
            this._events.set(event, listeners)
        }
        listeners.add(fn)
        return this
    }

    /**
     * Видалення підписки.
     * @param {string} event
     * @param {Function} fn
     */
    off(event, fn) {
        const listeners = this._events.get(event)
        if (listeners) {
            listeners.delete(fn)
            if (listeners.size === 0) this._events.delete(event)
        }
        return this
    }

    /**
     * Генерація події. Викликає всі слухачі у вказаному контексті з аргументами.
     * @param {string} event
     * @param {any} context - Контекст `this` для виконання функції.
     * @param {any[]} args
     */
    emitWithContext(event, context, args = []) {
        const listeners = this._events.get(event)
        if (!listeners) return false
        for (const fn of listeners) {
            fn.apply(context, args)
        }
        return true
    }
}
