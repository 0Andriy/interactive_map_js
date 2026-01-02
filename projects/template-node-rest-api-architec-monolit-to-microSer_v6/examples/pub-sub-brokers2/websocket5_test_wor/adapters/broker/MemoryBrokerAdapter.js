import { IBrokerAdapter } from '../../interfaces/IBrokerAdapter.js'

/**
 * @implements {IBrokerAdapter}
 * Локальний брокер з механізмом відписки для запобігання витокам пам'яті.
 */
export class MemoryBrokerAdapter extends IBrokerAdapter {
    constructor() {
        super()
        /**
         * @type {Map<string, Set<Function>>}
         * topics / channels
         */
        this.topics = new Map()
    }

    async subscribe(topic, callback) {
        if (!this.topics.has(topic)) {
            this.topics.set(topic, new Set())
        }
        this.topics.get(topic).add(callback)

        // Повертаємо функцію відписки
        return () => this.unsubscribe(topic, callback)
    }

    async unsubscribe(topic, callback) {
        const subs = this.topics.get(topic)
        if (subs) {
            subs.delete(callback)
            if (subs.size === 0) {
                this.topics.delete(topic)
            }
        }
    }

    async publish(topic, data) {
        this.topics.get(topic)?.forEach((cb) => cb(data))
    }
}
