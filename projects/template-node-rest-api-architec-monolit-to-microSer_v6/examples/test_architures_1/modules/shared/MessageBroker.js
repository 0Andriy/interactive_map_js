export class MessageBroker {
    constructor() {
        this.connection = null
    }

    async connect(url) {
        console.log(`[Broker] Connected to ${url}`)
        this.connection = { connected: true } // Замініть на реальний amqplib
    }

    async publish(exchange, routingKey, message) {
        console.log(`[Broker] Event Published: ${routingKey}`, message)
    }
}
