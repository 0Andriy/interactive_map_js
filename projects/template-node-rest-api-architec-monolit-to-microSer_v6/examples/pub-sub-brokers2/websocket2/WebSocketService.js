// src/services/websocket/WebSocketService.js
import { WebSocketServer } from 'ws'
import WebSocketConnection from './WebSocketConnection.js'

class WebSocketService {
    /**
     * @param {object} httpServer HTTP сервер, до якого підключається WS.
     * @param {import('../event-broker/interfaces/EventBrokerInterface.js').default} eventBroker RedisPubSubAdapter instance.
     * @param {object | null} logger Логер.
     */
    constructor(httpServer, eventBroker, logger) {
        this.wss = new WebSocketServer({ server: httpServer })
        this.eventBroker = eventBroker // Це тепер RedisPubSubAdapter
        this.logger = logger
        this.connections = new Map() // Map<string, WebSocketConnection>

        this.wss.on('connection', this.handleConnection.bind(this))

        this.setupHeartbeat()

        // Підписуємося на ВСІ вхідні повідомлення з Redis.
        // Redis сам фільтрує, на які канали ми підписані на рівні сервера.
        this.eventBroker.subscribe('*', this.handleRedisMessage.bind(this))

        this.logger?.info('WebSocket Service (High-Performance/Redis) ініціалізовано.')
    }

    handleConnection(ws, req) {
        // ... (Логіка аутентифікації з токеном/req.url, як обговорювалося раніше) ...
        const connectionId = Date.now().toString()
        const connection = new WebSocketConnection(ws, connectionId)
        this.connections.set(connectionId, connection)
        // connection.userId = 'user-123' // Заглушка userId після аутентифікації

        // --- ЛОГІКА АУТЕНТИФІКАЦІЇ ---
        // Припустимо, токен передається в query params URL: ws://localhost:3001/?token=XYZ
        const urlParams = new URLSearchParams(req.url.slice(1))
        const token = urlParams.get('token')

        if (token && this.authenticateToken(token)) {
            const userId = this.getUserIdFromToken(token) // Отримання ID користувача
            connection.userId = userId
            this.logger.info(
                `З'єднання ${connectionId} успішно автентифіковано як User ID: ${userId}`,
            )
            // Можна автоматично додавати користувача в його персональну кімнату
            // namespace.joinRoom(connection, `user:${userId}`);
        } else {
            this.logger.warn(
                `З'єднання ${connectionId} не автентифіковано. Можливо, обмежений доступ.`,
            )
            // Опційно: connection.ws.close();
        }
        // -----------------------------

        ws.on('message', (message) => this.handleMessage(connection, message))
        ws.on('close', () => this.handleClose(connectionId))
        ws.on('pong', () => connection.markAlive())
    }

    handleMessage(connection, message) {
        // Клієнт надсилає команди: 'subscribe', 'unsubscribe', 'publish_to_backend'
        try {
            const parsed = JSON.parse(message)

            if (parsed.command === 'subscribe' && parsed.topic) {
                // Коли клієнт підписується на кімнату, ми інформуємо Redis
                // і, опційно, зберігаємо стан у Redis (HashSet userId -> [rooms])
                this.eventBroker.publish(`ws:subscribe_request`, {
                    topic: parsed.topic,
                    userId: connection.userId,
                })
            } else if (parsed.command === 'unsubscribe' && parsed.topic) {
                this.eventBroker.publish(`ws:unsubscribe_request`, {
                    topic: parsed.topic,
                    userId: connection.userId,
                })
            }

            // Якщо клієнт хоче щось опублікувати назад в систему:
            if (parsed.command === 'publish' && parsed.topic && parsed.data) {
                // Публікуємо в Redis для обробки бекендом
                this.eventBroker.publish(parsed.topic, parsed.data)
            }
        } catch (e) {
            this.logger?.error('Не вдалося розібрати повідомлення WS:', message)
        }
    }

    handleClose(connectionId) {
        const connection = this.connections.get(connectionId)

        if (connection) {
            // 1. Видаляємо з'єднання з усіх кімнат, до яких воно належало
            connection.rooms.forEach((roomName) => {
                // Примітка: Логіка Namespace/Room наразі не має зворотного посилання на NS,
                // що ускладнює автоматичне видалення. Нам потрібен повний перебір або інша структура.

                // Найпростіший спосіб у поточній структурі: ітеруватися по NS і кімнатах
                this.namespaces.forEach((namespace) => {
                    const room = namespace.rooms.get(roomName)
                    if (room && room.connections.has(connection)) {
                        room.removeConnection(connection)
                        if (room.size === 0) {
                            namespace.rooms.delete(roomName) // Очищаємо порожню кімнату
                        }
                    }
                })
            })

            // 2. Видаляємо саме з'єднання з головного списку
            this.connections.delete(connectionId)

            this.logger.info(
                `WS-з'єднання ${connectionId} закрито. Залишилось ${this.connections.size} активних.`,
            )
        }
    }

    setupHeartbeat() {
        // ... (Логіка heartbeat, як обговорювалося раніше) ...
        setInterval(() => {
            this.connections.forEach((conn) => {
                if (conn.isAlive === false) {
                    conn.ws.terminate()
                    return
                }
                conn.isAlive = false
                conn.ws.ping()
            })
        }, 30000)
    }

    /**
     * Обробляє повідомлення, що надійшли з Redis.
     * Кожен WS-сервер отримує ВСІ повідомлення від Redis і фільтрує їх локально.
     */
    handleRedisMessage(data, topic) {
        // Дані з Redis мають містити інформацію про ціль (topic, room, userId)
        // Формат payload: { targetUserIds: ['u1', 'u2'], payload: {...} }

        const { targetUserIds, payload } = data

        if (targetUserIds && Array.isArray(targetUserIds)) {
            // Ефективна розсилка конкретним користувачам, які знаходяться на цьому сервері
            this.connections.forEach((conn) => {
                if (conn.userId && targetUserIds.includes(conn.userId)) {
                    conn.send(payload)
                }
            })
        }
        // Також можна підтримувати розсилку по загальних топіках, якщо потрібно
    }

    // Метод для широкомовного мовлення (всі з'єднання на ЦЬОМУ сервері)
    broadcastAllLocal(data) {
        this.connections.forEach((conn) => conn.send(data))
    }

    // Метод для широкомовного мовлення через Redis (ВСІ сервери і клієнти)
    broadcastAllGlobal(data) {
        // Внутрішній формат повідомлення, який зрозуміє handleRedisMessage на всіх серверах
        this.eventBroker.publish('global_broadcast_channel', {
            targetUserIds: Array.from(this.connections.values()).map((c) => c.userId),
            payload: data,
        })
    }
}

export default WebSocketService
