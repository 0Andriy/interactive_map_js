// src/websockets/pubsub.js
import Redis from 'ioredis'
import { REDIS_HOST, REDIS_PORT } from '../config/app.config.js'
// import { getChatWss, getNotificationWss } from './index.js'; // Можна імпортувати тут, якщо WSS ініціалізовані до того

let publisher
let subscriber
let activeWssInstances = {} // Зберігати посилання на ініціалізовані WSS

export const initializeRedisPubSub = (wssInstances) => {
    activeWssInstances = wssInstances // Отримуємо { chatWss, notificationWss }
    publisher = new Redis({ host: REDIS_HOST, port: REDIS_PORT })
    subscriber = new Redis({ host: REDIS_HOST, port: REDIS_PORT })

    subscriber.subscribe('chat_messages_channel', 'global_notifications_channel', (err, count) => {
        if (err) {
            console.error('Failed to subscribe to Redis channels:', err)
        } else {
            console.log(`Subscribed to ${count} Redis channels.`)
        }
    })

    subscriber.on('message', (channel, message) => {
        try {
            const parsedMessage = JSON.parse(message)
            // Маршрутизуємо повідомлення залежно від каналу
            if (channel === 'chat_messages_channel') {
                if (activeWssInstances.chatWss) {
                    activeWssInstances.chatWss.clients.forEach((client) => {
                        if (client.readyState === 1 /* WebSocket.OPEN */) {
                            // Можливо, фільтрувати за чат-кімнатою, якщо це чат
                            client.send(JSON.stringify(parsedMessage))
                        }
                    })
                }
            } else if (channel === 'global_notifications_channel') {
                if (activeWssInstances.notificationWss) {
                    activeWssInstances.notificationWss.clients.forEach((client) => {
                        if (client.readyState === 1 /* WebSocket.OPEN */) {
                            // Тут може бути логіка відправки сповіщення конкретному користувачу
                            // if (client.userId === parsedMessage.targetUserId) {
                            client.send(JSON.stringify(parsedMessage))
                            // }
                        }
                    })
                }
            }
        } catch (error) {
            console.error(`Error processing Redis message on channel ${channel}:`, error)
        }
    })

    publisher.on('error', (err) => console.error('Redis Publisher error:', err))
    subscriber.on('error', (err) => console.error('Redis Subscriber error:', err))
}

export const publishMessage = async (channel, message) => {
    if (publisher) {
        await publisher.publish(channel, JSON.stringify(message))
    } else {
        console.warn('Redis Publisher not initialized.')
    }
}
