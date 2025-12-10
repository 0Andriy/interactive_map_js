// src/services/websocket/WebSocketService.js
import { WebSocketServer } from 'ws'
import WebSocketConnection from './WebSocketConnection.js'
import WebSocketNamespace from './WebSocketNamespace.js'

class WebSocketService {
    constructor(httpServer, eventBroker, logger) {
        this.wss = new WebSocketServer({ server: httpServer })
        this.eventBroker = eventBroker
        this.logger = logger
        // Map<string, WebSocketNamespace> - Карта просторів імен
        this.namespaces = new Map()
        this.connections = new Map() // Map<string, WebSocketConnection>

        this.wss.on('connection', this.handleConnection.bind(this))

        // ВАЖЛИВО: Запускаємо механізм heartbeat
        this.setupHeartbeat()

        // Підписуємося на внутрішні події для розсилки WS-клієнтам
        this.eventBroker.subscribe('ws:publish', this.handleBrokerMessage.bind(this))

        this.logger.info('WebSocket Service ініціалізовано.')
    }

    registerNamespace(name) {
        if (!this.namespaces.has(name)) {
            const ns = new WebSocketNamespace(name, this.eventBroker, this.logger)
            this.namespaces.set(name, ns)
            this.logger.info(`Зареєстровано простір імен: ${name}`)
        }
        return this.namespaces.get(name)
    }

    handleConnection(ws) {
        // Генеруємо унікальний ID для з'єднання
        const connectionId = Date.now().toString()
        const connection = new WebSocketConnection(ws, connectionId)
        this.connections.set(connectionId, connection)

        ws.on('message', (message) => this.handleMessage(connection, message))
        ws.on('close', () => this.handleClose(connectionId))
        ws.on('error', (error) => this.logger.error('WS Помилка:', error))

        // Клієнт повинен відповідати на ping pong-ом, щоб isAlive стало true
        ws.on('pong', () => connection.markAlive())
    }

    handleMessage(connection, message) {
        // Клієнт надсилає команди у форматі JSON:
        // { namespace: '/chat', command: 'join', room: 'general' }
        // { namespace: '/chat', command: 'publish', room: 'general', event: 'new_msg', data: {...} }
        try {
            const parsed = JSON.parse(message)
            const ns = this.namespaces.get(parsed.namespace)

            if (ns && parsed.command === 'join' && parsed.room) {
                ns.joinRoom(connection, parsed.room)
            } else if (ns && parsed.command === 'publish' && parsed.room && parsed.event) {
                // Публікуємо повідомлення клієнта іншим клієнтам у кімнаті
                ns.emitToRoom(parsed.room, parsed.event, parsed.data)

                // Або публікуємо подію назад у внутрішній брокер, якщо потрібно повідомити backend-сервіси
                // const topic = `${parsed.namespace}:${parsed.room}:${parsed.event}`;
                // this.eventBroker.publish(topic, parsed.data);
            }
        } catch (e) {
            this.logger.error('Не вдалося розібрати повідомлення WS:', message)
        }
    }

    handleClose(connectionId) {
        this.connections.delete(connectionId)
        this.logger.info(`WS-з'єднання ${connectionId} закрито.`)
        // Логіка видалення клієнта з усіх кімнат при відключенні
    }

    /**
     * Реалізація Heartbeat: регулярно перевіряє активність з'єднань і закриває мертві.
     */
    setupHeartbeat() {
        // Відправляємо ping кожні 30 секунд
        const interval = setInterval(() => {
            this.connections.forEach((connection, connId) => {
                if (connection.isAlive === false) {
                    // Якщо клієнт не відповів на попередній ping (isAlive залишився false), закриваємо з'єднання
                    this.logger.info(`З'єднання ${connId} мертве, закриваємо.`)
                    return connection.ws.terminate()
                }

                // Встановлюємо isAlive в false і відправляємо ping
                connection.isAlive = false
                connection.ws.ping()
            })
        }, 30000) // 30 секунд

        // Зберігаємо інтервал, якщо потрібно буде його очистити при зупинці сервера
        this.wss.on('close', () => clearInterval(interval))
    }

    /**
     * Ефективний Broadcast по всім підключенням сервера.
     */
    broadcastAll(event, data) {
        const message = JSON.stringify({ event, data })
        this.connections.forEach((conn) => {
            if (conn.ws.readyState === conn.ws.OPEN) {
                conn.ws.send(message)
            }
        })
        this.logger.info(`Broadcasted '${event}' to ${this.connections.size} total connections.`)
    }

    /**
     * Обробляє внутрішні повідомлення від EventBroker і розсилає їх відповідним WS-клієнтам/кімнатам.
     * Очікує дані формату: { namespace: '/chat', room: 'general', event: 'update', payload: {...} }
     */
    handleBrokerMessage(data) {
        const { namespace, room, event, payload } = data
        const ns = this.namespaces.get(namespace)
        if (ns) {
            ns.emitToRoom(room, event, payload)
        } else {
            this.logger.error(`Отримано повідомлення для неіснуючого NS: ${namespace}`)
        }
    }
}

export default WebSocketService
