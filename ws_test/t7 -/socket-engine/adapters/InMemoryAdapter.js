import { BaseAdapter } from './BaseAdapter.js'

/**
 * Очищений високопродуктивний адаптер для управління кімнатами та розсилки повідомлень у пам'яті.
 * Повністю делегує логіку Connection State Recovery зовнішньому SessionStore.
 *
 * @extends BaseAdapter
 */
export class InMemoryAdapter extends BaseAdapter {
    /**
     * @param {any} nsp - Екземпляр простору імен.
     */
    constructor(nsp) {
        super(nsp)

        /** @type {Map<string, any>} SocketId -> Socket */
        this.sockets = new Map()
        /** @type {Map<string, Set<string>>} RoomName -> Set(SocketId) */
        this.rooms = new Map()
        /** @type {Map<string, Set<string>>} SocketId -> Set(RoomName) */
        this.sids = new Map()
    }

    /**
     * @private
     */
    #removeSocketFromRoom(socketId, roomName) {
        const roomSocketIds = this.rooms.get(roomName)
        if (!roomSocketIds) return

        roomSocketIds.delete(socketId)

        if (roomSocketIds.size === 0) {
            this.rooms.delete(roomName)
            // Повідомляємо зовнішній сервер/стор, що кімната порожня (опціонально)
            if (this.nsp?.sessionStore) {
                this.nsp.sessionStore.clearRoomBuffer(roomName)
            }
        }
    }

    /** @override */
    registerSocket(socket) {
        if (!socket || !socket?.id || typeof socket.id !== 'string') return
        this.sockets.set(socket.id, socket)
    }

    /** @override */
    add(socketId, roomName) {
        if (typeof socketId !== 'string' || typeof roomName !== 'string') return

        let socketRooms = this.sids.get(socketId)
        if (!socketRooms) {
            socketRooms = new Set()
            this.sids.set(socketId, socketRooms)
        }
        socketRooms.add(roomName)

        let roomSocketIds = this.rooms.get(roomName)
        if (!roomSocketIds) {
            roomSocketIds = new Set()
            this.rooms.set(roomName, roomSocketIds)
        }
        roomSocketIds.add(socketId)
    }

    /** @override */
    addAll(socketId, rooms) {
        if (typeof socketId !== 'string') return
        if (!Array.isArray(rooms) && !(rooms instanceof Set)) {
            if (typeof rooms === 'string') this.add(socketId, rooms)
            return
        }
        for (const roomName of rooms) {
            this.add(socketId, roomName)
        }
    }

    /** @override */
    del(socketId, roomName) {
        if (typeof socketId !== 'string' || typeof roomName !== 'string') return

        this.#removeSocketFromRoom(socketId, roomName)

        const socketRooms = this.sids.get(socketId)
        if (socketRooms) {
            socketRooms.delete(roomName)
            if (socketRooms.size === 0) this.sids.delete(socketId)
        }
    }

    /**
     * @override
     * Тепер метод виконує ТІЛЬКИ негайне очищення індексів
     */
    delAll(socketId) {
        if (typeof socketId !== 'string') return

        const socketRooms = this.sids.get(socketId)
        if (socketRooms) {
            for (const roomName of socketRooms) {
                this.#removeSocketFromRoom(socketId, roomName)
            }
        }
        this.sids.delete(socketId)
        this.sockets.delete(socketId)
    }

    /** @override */
    getRoomsBySocket(socketId) {
        const roomsSet = this.sids.get(socketId)
        return roomsSet ? new Set(roomsSet) : new Set()
    }

    /** @override */
    async fetchSockets(opts = {}) {
        if (opts.room) {
            const socketIdsSet = this.rooms.get(opts.room)
            if (!socketIdsSet || socketIdsSet.size === 0) return []

            const result = []
            for (const id of socketIdsSet) {
                const socket = this.sockets.get(id)
                if (socket) result.push(socket)
            }
            return result
        }
        return Array.from(this.sockets.values())
    }

    /** @override */
    broadcast(packet, opts) {
        const rooms = opts.rooms || new Set()
        const except = opts.except || new Set()
        const targetSocketIds = new Set()

        if (rooms.size > 0) {
            for (const roomName of rooms) {
                // Якщо у нас у просторі імен підключено SessionStore, зберігаємо туди повідомлення
                if (this.nsp?.sessionStore) {
                    this.nsp.sessionStore.addMessage(roomName, packet)
                }

                const socketIdsSet = this.rooms.get(roomName)
                if (socketIdsSet) {
                    for (const id of socketIdsSet) {
                        targetSocketIds.add(id)
                    }
                }
            }
        } else {
            for (const id of this.sockets.keys()) {
                targetSocketIds.add(id)
            }
        }

        for (const id of targetSocketIds) {
            if (except.has(id)) continue

            const socket = this.sockets.get(id)
            if (socket && typeof socket.sendPacket === 'function') {
                socket.sendPacket(packet, opts.flags)
            }
        }
    }
}
