// core/Socket.js
import { EventEmitter } from '../utils/EventEmitter.js'
import { MessageProtocol } from '../utils/MessageProtocol.js'
import { v4 as uuidv4 } from 'uuid' // npm install uuid

// Конфігурація для Heartbeat (можна винести в конфіг сервера)
const HEARTBEAT_INTERVAL = 25000 // Пінг кожні 25 секунд
const HEARTBEAT_TIMEOUT = 50000 // Таймаут для відповіді понг (50 секунд)

export class Socket extends EventEmitter {
    constructor(ws, namespace, serverManager) {
        super()
        this.ws = ws
        this.id = uuidv4() // Унікальний ID для сокета
        this.namespace = namespace
        this.rooms = new Set() // Кімнати, до яких належить цей сокет
        this.serverManager = serverManager // Для доступу до централізованих функцій

        this.onWsMessage = this.handleWsMessage.bind(this)
        this.onWsClose = this.handleWsClose.bind(this)
        this.onWsError = this.handleWsError.bind(this)

        this.ws.on('message', this.onWsMessage)
        this.ws.on('close', this.onWsClose)
        this.ws.on('error', this.onWsError)

        // Додаємо сокет до кімнати за замовчуванням (його власний ID)
        this.join(this.id)

        this.isAlive = true // Стан активності сокета
        this.heartbeatInterval = null
        this.heartbeatTimeout = null

        this.setupHeartbeat()
    }

    // Надіслати подію конкретному клієнту
    emit(event, data, isBinary = false) {
        if (this.ws.readyState === this.ws.OPEN) {
            // Використовуємо MessageProtocol для серіалізації, передаючи флаг isBinary
            const message = MessageProtocol.serialize(
                event,
                data,
                this.namespace.path,
                null,
                isBinary,
            )
            this.ws.send(message)
        }
    }

    handleWsMessage(message) {
        this.isAlive = true // Отримали повідомлення, сокет живий

        // Обробка Heartbeat повідомлень
        if (message.toString() === 'ping') {
            this.ws.send('pong') // Відповідаємо "pong" на "ping"
            return
        }
        if (message.toString() === 'pong') {
            // Отримали "pong", скидаємо таймаут
            clearTimeout(this.heartbeatTimeout)
            this.heartbeatTimeout = setTimeout(() => this.terminate(), HEARTBEAT_TIMEOUT)
            return
        }

        // Обробка даних: MessageProtocol тепер обробляє бінарні дані
        const parsed = MessageProtocol.deserialize(message)
        if (parsed) {
            this.emit(parsed.event, parsed.data)
            this.namespace.handleSocketEvent(this, parsed.event, parsed.data)
        }
    }

    handleWsClose() {
        console.log(`Socket ${this.id} disconnected from namespace ${this.namespace.path}`)
        this.namespace.removeSocket(this) // Повідомити простір імен про відключення
        this.emit('disconnect') // Власна подія відключення сокета
        this.ws.off('message', this.onWsMessage)
        this.ws.off('close', this.onWsClose)
        this.ws.off('error', this.onWsError)
    }

    handleWsError(error) {
        console.error(`Socket ${this.id} error:`, error)
        this.emit('error', error)
    }

    // Встановлення таймерів для серцебиття
    setupHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (!this.isAlive) {
                // Якщо клієнт не відповів на попередній пінг, закриваємо з'єднання
                this.terminate()
                return
            }
            this.isAlive = false // Позначаємо, що очікуємо відповідь
            this.ws.send('ping') // Надсилаємо пінг
            this.heartbeatTimeout = setTimeout(() => {
                this.terminate() // Закрити, якщо понг не отримано
            }, HEARTBEAT_TIMEOUT)
        }, HEARTBEAT_INTERVAL)
    }

    // Метод для примусового закриття з'єднання
    terminate() {
        console.log(`Socket ${this.id} terminated due to heartbeat timeout.`)
        this.ws.terminate() // Примусове закриття
        clearInterval(this.heartbeatInterval)
        clearTimeout(this.heartbeatTimeout)
    }

    handleWsClose() {
        console.log(`Socket ${this.id} disconnected from namespace ${this.namespace.path}`)
        this.namespace.removeSocket(this)
        this.emit('disconnect')
        // Очищаємо таймери серцебиття при закритті
        clearInterval(this.heartbeatInterval)
        clearTimeout(this.heartbeatTimeout)

        this.ws.off('message', this.onWsMessage)
        this.ws.off('close', this.onWsClose)
        this.ws.off('error', this.onWsError)
    }

    // --- Функції для кімнат ---
    join(roomName) {
        if (!this.rooms.has(roomName)) {
            this.rooms.add(roomName)
            this.namespace.roomManager.addSocketToRoom(roomName, this)
            console.log(`Socket ${this.id} joined room: ${roomName}`)
        }
    }

    leave(roomName) {
        if (this.rooms.has(roomName)) {
            this.rooms.delete(roomName)
            this.namespace.roomManager.removeSocketFromRoom(roomName, this)
            console.log(`Socket ${this.id} left room: ${roomName}`)
        }
    }

    // Надіслати подію всьому, крім цього сокета
    broadcast(event, data) {
        this.namespace.emitToOthersInNamespace(this, event, data)
    }
}
