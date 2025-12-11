// src/interfaces/IBroker.js
export class IBroker {
    async connect() {
        throw new Error('Method not implemented.')
    }
    async publish(channel, message) {
        throw new Error('Method not implemented.')
    }
    subscribe(channel, handler) {
        throw new Error('Method not implemented.')
    }
    // ... другие методы (sAdd, sMembers для хранения состояния комнат)
}
