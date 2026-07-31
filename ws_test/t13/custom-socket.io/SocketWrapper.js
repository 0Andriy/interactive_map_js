import crypto from 'crypto'

export class SocketWrapper {
    constructor(ws, namespace, handshakeData) {
        this.ws = ws
        this.namespace = namespace
        this.id = crypto.randomUUID()
        this.handshake = handshakeData
        this.rooms = new Set([this.id]) // Кожен сокет автоматично у своїй кімнаті
        this.user = null // Буде заповнено в middleware

        this._eventListeners = new Map()
        this._targetRoom = null // Для ланцюжка .to().emit()
        this._broadcastMode = false // Для ланцюжка .broadcast.emit()

        this._init()
    }

    _init() {
        this.ws.on('message', async (data) => {
            try {
                const packet = JSON.parse(data.toString())
                // Протокол: { type: 'event', name: '...', args: [...], ackId: '...' }
                if (packet.type === 'event') {
                    const listeners = this._eventListeners.get(packet.name) || []

                    // Створюємо функцію-коллбек, якщо клієнт чекає на відповідь (Acknowledgement)
                    let ackCallback = () => {}
                    if (packet.ackId) {
                        ackCallback = (responseData) => {
                            this._sendRaw({ type: 'ack', ackId: packet.ackId, data: responseData })
                        }
                    }

                    for (const listener of listeners) {
                        await listener(...packet.args, ackCallback)
                    }
                }
            } catch (err) {
                console.error('Помилка парсингу пакета сокету:', err)
            }
        })

        this.ws.on('close', (code, reason) => {
            this.namespace._handleDisconnect(this, reason ? reason.toString() : 'unknown')
        })

        this.ws.on('error', (err) => {
            const errorListeners = this._eventListeners.get('error') || []
            errorListeners.forEach((l) => l(err))
        })
    }

    // Реєстрація подій (socket.on)
    on(eventName, callback) {
        if (!this._eventListeners.has(eventName)) {
            this._eventListeners.set(eventName, [])
        }
        this._eventListeners.get(eventName).push(callback)
        return this
    }

    // Керування кімнатами
    join(roomId) {
        if (!roomId) return
        this.rooms.add(roomId)
        this.namespace._addUserToRoom(roomId, this)
        return this
    }

    leave(roomId) {
        this.rooms.delete(roomId)
        this.namespace._removeUserFromRoom(roomId, this)
        return this
    }

    // Модифікатори ланцюжка відправки (.to, .broadcast)
    to(roomId) {
        this._targetRoom = roomId
        return this
    }

    in(roomId) {
        return this.to(roomId)
    }

    get broadcast() {
        this._broadcastMode = true
        return this
    }

    // Відправка повідомлення (socket.emit)
    emit(eventName, ...args) {
        const targetRoom = this._targetRoom
        const isBroadcast = this._broadcastMode

        // Скидаємо прапорці ланцюжка відразу
        this._targetRoom = null
        this._broadcastMode = false

        const packet = { type: 'event', name: eventName, args }

        if (targetRoom) {
            // Відправка в конкретну кімнату
            this.namespace._emitToRoom(targetRoom, packet, isBroadcast ? this : null)
        } else if (isBroadcast) {
            // Броадкаст усім у Namespace, крім поточного сокету
            this.namespace._emitToNamespace(packet, this)
        } else {
            // Персональна відправка тільки цьому клієнту
            this._sendRaw(packet)
        }
        return true
    }

    // Примусовий дисконнект
    disconnect(closeUnderlyingConnection = true) {
        if (closeUnderlyingConnection) {
            this.ws.close()
        } else {
            this.namespace._handleDisconnect(this, 'server namespace disconnect')
        }
    }

    _sendRaw(packet) {
        if (this.ws.readyState === 1) {
            // WebSocket.OPEN
            this.ws.send(JSON.stringify(packet))
        }
    }
}
