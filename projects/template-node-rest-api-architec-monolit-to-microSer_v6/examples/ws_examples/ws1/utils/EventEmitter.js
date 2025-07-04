// utils/EventEmitter.js
export class EventEmitter {
    constructor() {
        this.listeners = new Map()
    }

    on(event, listener) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set())
        }
        this.listeners.get(event).add(listener)
    }

    emit(event, ...args) {
        if (this.listeners.has(event)) {
            for (const listener of this.listeners.get(event)) {
                try {
                    listener(...args)
                } catch (error) {
                    console.error(`Error in event listener for '${event}':`, error)
                }
            }
        }
    }

    off(event, listener) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).delete(listener)
        }
    }
}

