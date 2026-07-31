import crypto from 'crypto'
import { EventEmitter } from './EventEmitter.js'

export class SocketWrapper extends EventEmitter {
    constructor(ws, namespace, handshakeData) {
        super() // Ініціалізуємо наш кастомний EventEmitter всередині сокету
        this.ws = ws
        this.namespace = namespace
        this.id = crypto.randomUUID()
        this.handshake = handshakeData
        this.rooms = new Set()
        this.user = null // Заповнюється через мідлвари

        // Тимчасовий стан для ланцюжків методів (.to().emit())
        this._roomsToSend = new Set()
        this._exceptSend = new Set()

        this.join(this.id) // Кожен сокет автоматично входить у власну кімнату
        this._listenToWire()
    }

    _listenToWire() {
        this.ws.on('message', async (rawData) => {
            try {
                const packet = JSON.parse(rawData.toString())

                if (packet.type === 'event') {
                    // Якщо клієнт очікує підтвердження (Acknowledgement callback)
                    let ackCallback = () => {}
                    if (packet.ackId) {
                        ackCallback = (responseData) => {
                            this._sendRaw({ type: 'ack', ackId: packet.ackId, data: responseData })
                        }
                    }

                    // Наш кастомний EventEmitter викликає події (наприклад, 'message:send')
                    await this.emit(packet.name, ...packet.args, ackCallback)
                }
            } catch (err) {
                console.error('Помилка парсингу WebSocket повідомлення:', err)
            }
        })

        this.ws.on('close', (code, reason) => {
            this.namespace._handleDisconnect(this, reason ? reason.toString() : 'closed')
        })

        this.ws.on('error', (err) => {
            this.emit('error', err)
        })
    }

    join(roomId) {
        if (!roomId) return this
        this.rooms.add(roomId)
        this.namespace.adapter.addAll(this.id, [roomId])
        return this
    }

    leave(roomId) {
        this.rooms.delete(roomId)
        this.namespace.adapter.del(this.id, roomId)
        return this
    }

    to(roomId) {
        this._roomsToSend.add(roomId)
        return this
    }

    in(roomId) {
        return this.to(roomId)
    }

    get broadcast() {
        this._exceptSend.add(this.id) // Виключаємо себе з розсилки
        return this
    }

    // Перевантажуємо emit для бізнес-логіки розсилки (залишаючи базовий emit для внутрішніх подій)
    emitEvent(eventName, ...args) {
        const packet = { type: 'event', name: eventName, args }

        const rooms = new Set(this._roomsToSend)
        const except = new Set(this._exceptSend)

        // Скидаємо тимчасовий стан ланцюжка
        this._roomsToSend.clear()
        this._exceptSend.clear()

        if (rooms.size > 0 || except.size > 0) {
            // Делегуємо розсилку Адаптеру
            this.namespace.adapter.broadcast(packet, { rooms, except })
        } else {
            // Персональна відправка тільки цьому сокету
            this._sendRaw(packet)
        }
        return true
    }

    // Для збереження повної сумісності зі старим кодом:
    // Якщо викликано socket.emit() у коді сервера, ми дивимось, чи це ланцюжок (.to або .broadcast)
    emit(eventName, ...args) {
        if (
            this._roomsToSend.size > 0 ||
            this._exceptSend.size > 0 ||
            !this._listeners.has(eventName)
        ) {
            return this.emitEvent(eventName, ...args)
        }
        return super.emit(eventName, ...args)
    }

    disconnect(closeConnection = true) {
        if (closeConnection) this.ws.close()
        else this.namespace._handleDisconnect(this, 'server disconnect')
    }

    _sendRaw(packet) {
        if (this.ws.readyState === 1) {
            this.ws.send(JSON.stringify(packet))
        }
    }
}
