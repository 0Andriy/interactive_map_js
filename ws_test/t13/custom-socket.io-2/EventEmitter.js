export class EventEmitter {
    constructor() {
        this._listeners = new Map()
    }

    on(event, callback) {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, [])
        }
        this._listeners.get(event).push(callback)
        return this // Для ланцюжків методів
    }

    async emit(event, ...args) {
        const callbacks = this._listeners.get(event)
        if (!callbacks) return

        // Виконуємо всі слухачі асинхронно
        for (const callback of callbacks) {
            await callback(...args)
        }
    }

    off(event, callback) {
        if (!this._listeners.has(event)) return
        if (!callback) {
            this._listeners.delete(event)
            return
        }
        const filtered = this._listeners.get(event).filter((cb) => cb !== callback)
        this._listeners.set(event, filtered)
    }
}
