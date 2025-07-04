// src/websockets/pubsub.js (оновлено для Варіанту 2)
import Redis from 'ioredis'
import { REDIS_HOST, REDIS_PORT } from '../config/app.config.js' // Ваша конфігурація Redis
import RoomManager from './RoomManager.js' // Імпортуємо ваш НЕМОДИФІКОВАНИЙ RoomManager

/** @type {Redis.Redis} */
let publisher
/** @type {Redis.Redis} */
let subscriber
/** @type {RoomManager | null} */
let roomManagerInstance = null
/** @type {import('./RoomManager.js').Logger} */
let logger = console

export const initializeRedisPubSub = (roomMgr, appLogger = console) => {
    roomManagerInstance = roomMgr
    logger = appLogger

    publisher = new Redis({ host: REDIS_HOST, port: REDIS_PORT })
    subscriber = new Redis({ host: REDIS_HOST, port: REDIS_PORT })

    subscriber.on('error', (err) => logger.error('Redis Subscriber Error:', err))
    publisher.on('error', (err) => logger.error('Redis Publisher Error:', err))

    // Підписуємося на глобальний канал розсилок за замовчуванням
    subscriber.subscribe('global_broadcast_channel', (err, count) => {
        if (err) {
            logger.error('Failed to subscribe to global_broadcast_channel:', err)
        } else {
            logger.info(`Subscribed to global_broadcast_channel. Total channels: ${count}`)
        }
    })

    // Redis Subscriber слухає всі повідомлення з Redis
    subscriber.on('message', (channel, message) => {
        try {
            const parsedMessage = JSON.parse(message)
            logger.debug(`Received Redis message from channel ${channel}:`, parsedMessage)

            if (!roomManagerInstance) {
                logger.warn(
                    'RoomManager instance not set in Redis Pub/Sub, cannot forward messages.',
                )
                return
            }

            // Обробка глобальних розсилок
            if (channel === 'global_broadcast_channel') {
                // Використовуємо метод broadcastToAllClients RoomManager'а для розсилки локальним клієнтам
                roomManagerInstance.broadcastToAllClients(parsedMessage) // Передаємо вже розпарсений об'єкт
            }
            // Обробка повідомлень для конкретних кімнат
            else if (channel.startsWith('room:')) {
                const roomName = channel.substring(5) // Отримуємо ID кімнати
                // Використовуємо метод sendMessageToRoom RoomManager'а для розсилки локальним клієнтам
                roomManagerInstance.sendMessageToRoom(roomName, parsedMessage) // Передаємо вже розпарсений об'єкт
            }
            // Додайте інші канали за потребою
        } catch (error) {
            logger.error('Error parsing Redis message or in message handler:', error)
        }
    })

    logger.info('Redis Pub/Sub initialized.')
}

/**
 * Публікує повідомлення в Redis канал.
 * @param {string} channel - Назва Redis каналу.
 * @param {string | object | Buffer | ArrayBuffer} message - Повідомлення для публікації.
 */
export const publishMessage = async (channel, message) => {
    if (!publisher) {
        logger.warn('Redis Publisher not initialized.')
        return
    }
    let payloadToSend
    if (
        typeof message === 'object' &&
        message !== null &&
        !Buffer.isBuffer(message) &&
        !(message instanceof ArrayBuffer)
    ) {
        payloadToSend = JSON.stringify(message)
    } else {
        payloadToSend = message
    }
    await publisher.publish(channel, payloadToSend)
    logger.debug(`Published to Redis channel '${channel}'.`)
}

// Функції для управління підписками на канали кімнат
// Ці функції будуть викликатися з вашої логіки, яка взаємодіє з RoomManager
export const subscribeToRoomChannel = async (roomName) => {
    if (!subscriber) {
        logger.warn('Redis Subscriber not initialized, cannot subscribe to room channel.')
        return
    }
    await subscriber.subscribe(`room:${roomName}`, (err) => {
        if (err) logger.error(`Error subscribing to Redis room:${roomName}:`, err)
        else logger.info(`Subscribed to Redis channel room:${roomName}.`)
    })
}

export const unsubscribeFromRoomChannel = async (roomName) => {
    if (!subscriber) {
        logger.warn('Redis Subscriber not initialized, cannot unsubscribe from room channel.')
        return
    }
    await subscriber.unsubscribe(`room:${roomName}`, (err) => {
        if (err) logger.error(`Error unsubscribing from Redis room:${roomName}:`, err)
        else logger.info(`Unsubscribed from Redis channel room:${roomName}.`)
    })
}

// Додатковий метод для очищення ресурсів Redis при завершенні роботи сервера
export const closeRedisConnections = async () => {
    if (publisher) await publisher.quit()
    if (subscriber) await subscriber.quit()
    logger.info('Redis connections closed.')
}
