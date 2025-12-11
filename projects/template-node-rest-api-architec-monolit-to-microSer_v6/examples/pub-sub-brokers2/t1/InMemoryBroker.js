// InMemoryBroker.js
class InMemoryBroker {
    constructor() {
        this.subscriptions = new Map() // Канал -> [обробник1, обробник2, ...]
    }

    publish(channel, message) {
        const handlers = this.subscriptions.get(channel)
        if (handlers) {
            // Імітуємо асинхронність, викликаючи обробники
            handlers.forEach((handler) => setTimeout(() => handler(message), 0))
        }
    }

    subscribe(channel, handler) {
        if (!this.subscriptions.has(channel)) {
            this.subscriptions.set(channel, [])
        }
        this.subscriptions.get(channel).push(handler)
    }
}
