// adapters/RedisAdapter.js
import { EventEmitter } from '../utils/EventEmitter.js'
import { createClient } from 'redis' // npm install redis

export class RedisAdapter extends EventEmitter {
    constructor(redisOptions, serverManager) {
        super()
        this.pubClient = createClient(redisOptions)
        this.subClient = this.pubClient.duplicate()
        this.serverManager = serverManager // Для можливості зворотного виклику

        this.pubClient
            .connect()
            .then(() => console.log('Redis Publisher Connected'))
            .catch((err) => console.error('Redis Publisher Connection Error:', err))

        this.subClient
            .connect()
            .then(() => {
                console.log('Redis Subscriber Connected')
                // Підписуємося на єдиний канал для міжсерверної комунікації
                this.subClient.subscribe(
                    'ws_inter_server_messages',
                    this.handleRedisMessage.bind(this),
                )
            })
            .catch((err) => console.error('Redis Subscriber Connection Error:', err))
    }

    // Публікація повідомлення для інших серверів
    async publish(message) {
        // message тепер може містити isBinary флаг
        try {
            // Для Redis ми повинні серіалізувати все в JSON або буфер.
            // Якщо data бінарна, ми перетворимо її на Base64 для передачі через Redis
            // та відновимо на іншому кінці.
            let payload = message.data
            if (message.isBinary && payload instanceof Buffer) {
                payload = payload.toString('base64')
            }

            const messageToPublish = {
                ...message,
                data: payload,
                isBase64Encoded: message.isBinary, // Вказуємо, що бінарні дані кодовані
            }

            await this.pubClient.publish(
                'ws_inter_server_messages',
                JSON.stringify(messageToPublish),
            )
        } catch (error) {
            console.error('Error publishing to Redis:', error)
        }
    }

    // Обробка повідомлень, що надходять з Redis
    handleRedisMessage(message) {
        try {
            const parsedMessage = JSON.parse(message)
            // Відновлюємо бінарні дані з Base64, якщо вони були закодовані
            if (parsedMessage.isBase64Encoded) {
                parsedMessage.data = Buffer.from(parsedMessage.data, 'base64')
            }

            this.emit('message', parsedMessage) // Передаємо повідомлення у WebSocketServerManager
        } catch (error) {
            console.error('Error parsing Redis message from adapter:', error)
        }
    }

    close() {
        this.pubClient.quit()
        this.subClient.quit()
        console.log('Redis Adapter disconnected')
    }
}
