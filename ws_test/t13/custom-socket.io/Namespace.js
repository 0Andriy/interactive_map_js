import { SocketWrapper } from './SocketWrapper.js'

export class Namespace {
    constructor(name) {
        this.name = name
        this.sockets = new Map() // socketId -> SocketWrapper
        this._rooms = new Map() // roomId -> Set of SocketWrappers
        this._middlewares = []
        this._connectionListeners = []
    }

    // Додавання middleware (use)
    use(fn) {
        this._middlewares.push(fn)
        return this
    }

    // Головний слухач підключення
    on(eventName, callback) {
        if (eventName === 'connection') {
            this._connectionListeners.push(callback)
        }
        return this
    }

    // Створення та обробка нового з'єднання
    async _handleConnection(ws, handshakeData) {
        const socket = new SocketWrapper(ws, this, handshakeData)

        // Послідовно виконуємо всі middlewares
        try {
            for (const middleware of this._middlewares) {
                await new Promise((resolve, reject) => {
                    middleware(socket, (err) => {
                        if (err) reject(err)
                        else resolve()
                    })
                })
            }
        } catch (authError) {
            // Якщо middleware повернув помилку (наприклад, помилка JWT)
            socket._sendRaw({ type: 'connect_error', message: authError.message })
            ws.close()
            return
        }

        // Реєструємо сокет
        this.sockets.set(socket.id, socket)
        this._addUserToRoom(socket.id, socket) // Авто-кімната за ID сокета

        // Викликаємо слухачів події 'connection'
        this._connectionListeners.forEach((listener) => listener(socket))
    }

    // Допоміжні методи для роботи з кімнатами
    _addUserToRoom(roomId, socketWrapper) {
        if (!this._rooms.has(roomId)) {
            this._rooms.set(roomId, new Set())
        }
        this._rooms.get(roomId).add(socketWrapper)
    }

    _removeUserFromRoom(roomId, socketWrapper) {
        if (this._rooms.has(roomId)) {
            const room = this._rooms.get(roomId)
            room.delete(socketWrapper)
            if (room.size === 0) this._rooms.delete(roomId)
        }
    }

    // Еміт повідомлення на весь Namespace
    _emitToNamespace(packet, excludeSocket = null) {
        this.sockets.forEach((socket) => {
            if (excludeSocket && socket.id === excludeSocket.id) return
            socket._sendRaw(packet)
        })
    }

    // Еміт повідомлення в кімнату
    _emitToRoom(roomId, packet, excludeSocket = null) {
        const roomSockets = this._rooms.get(roomId)
        if (!roomSockets) return

        roomSockets.forEach((socket) => {
            if (excludeSocket && socket.id === excludeSocket.id) return
            socket._sendRaw(packet)
        })
    }

    // Аналог io.in() чи io.to() на рівні Namespace
    to(roomId) {
        return {
            emit: (eventName, ...args) => {
                this._emitToRoom(roomId, { type: 'event', name: eventName, args })
            },
        }
    }

    // Реалізація fetchSockets() для сумісності з Redis-подібним синтаксисом вашого коду
    async fetchSockets() {
        // Повертає масив проксі-об'єктів сокетів, які мають властивості id, rooms
        return Array.from(this.sockets.values()).map((s) => ({
            id: s.id,
            rooms: s.rooms,
            leave: (roomId) => s.leave(roomId),
            emit: (eventName, ...args) => s.emit(eventName, ...args),
            disconnect: (force) => s.disconnect(force),
        }))
    }

    // Внутрішня реалізація in() для сумісності із синтаксисом: io.of('/chat').in(`user:${id}`).fetchSockets()
    in(roomId) {
        const self = this
        return {
            async fetchSockets() {
                const roomSockets = self._rooms.get(roomId) || new Set()
                return Array.from(roomSockets).map((s) => ({
                    id: s.id,
                    rooms: s.rooms,
                    leave: (roomId) => s.leave(roomId),
                    emit: (eventName, ...args) => s.emit(eventName, ...args),
                    disconnect: (force) => s.disconnect(force),
                }))
            },
        }
    }

    // Обробка відключення сокету
    _handleDisconnect(socket, reason) {
        // Викликаємо подію 'disconnecting', доки сокет ще в кімнатах
        const disconnectingListeners = socket._eventListeners.get('disconnecting') || []
        disconnectingListeners.forEach((l) => l(reason))

        // Видаляємо сокет з усіх кімнат
        socket.rooms.forEach((roomId) => {
            this._removeUserFromRoom(roomId, socket)
        })

        this.sockets.delete(socket.id)

        // Викликаємо фінальну подію 'disconnect'
        const disconnectListeners = socket._eventListeners.get('disconnect') || []
        disconnectListeners.forEach((l) => l(reason))
    }
}
