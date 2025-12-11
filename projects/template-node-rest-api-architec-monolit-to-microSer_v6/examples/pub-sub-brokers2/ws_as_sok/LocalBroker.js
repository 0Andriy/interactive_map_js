// src/services/LocalBroker.js
import { IBroker } from '../interfaces/IBroker.js'

export class LocalBroker extends IBroker {
    constructor() {
        super()
        this.handlers = new Map() // channel -> Set<handler>
        this.dataStore = new Map() // Имитация хранения данных комнат
    }
    async connect() {
        console.log('Local Broker connected.')
    }
    async publish(channel, message) {
        if (this.handlers.has(channel)) {
            this.handlers.get(channel).forEach((handler) => handler(message))
        }
    }
    subscribe(channel, handler) {
        if (!this.handlers.has(channel)) {
            this.handlers.set(channel, new Set())
        }
        this.handlers.get(channel).add(handler)
    }
    // Имитация команд Redis для комнат
    async sAdd(key, value) {
        if (!this.dataStore.has(key)) this.dataStore.set(key, new Set())
        this.dataStore.get(key).add(value)
    }
    async sMembers(key) {
        return Array.from(this.dataStore.get(key) || [])
    }
}
