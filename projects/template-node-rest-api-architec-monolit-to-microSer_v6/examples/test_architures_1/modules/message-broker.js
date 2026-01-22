// src/shared/infrastructure/message-broker.js
export class MessageBroker {
    constructor(connection) {
        this.connection = connection // екземпляр підключення (напр. amqplib)
    }

    async publish(exchange, routingKey, message) {
        console.log(`[Broker] Publishing to ${exchange}:`, message)
        // Логіка відправки повідомлення в чергу
        const channel = await this.connection.createChannel()
        await channel.assertExchange(exchange, 'topic', { durable: true })
        channel.publish(exchange, routingKey, Buffer.from(JSON.stringify(message)))
    }
}
