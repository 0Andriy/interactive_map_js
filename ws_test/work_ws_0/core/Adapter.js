export class Adapter {
    constructor(options) {
        this.nsp = options.nsp
        this.serverId = options.serverId
        // RoomName -> Set(SocketId)
        this.rooms = new Map()
        // SocketId -> Set(RoomName)
        this.sids = new Map()
    }

    /**
     * Внутрішній метод для отримання списку ID для розсилки/пошуку.
     * Допомагає уникнути дублювання логіки.
     */
    _computeTargetIds(rooms, except) {
        const targetIds = new Set()
        const roomsSet =
            rooms instanceof Set
                ? rooms
                : new Set(Array.isArray(rooms) ? rooms : rooms ? [rooms] : [])
        const exceptSet =
            except instanceof Set
                ? except
                : new Set(Array.isArray(except) ? except : except ? [except] : [])

        if (roomsSet.size > 0) {
            for (const room of roomsSet) {
                const ids = this.rooms.get(room)
                if (ids) {
                    for (const id of ids) {
                        if (!exceptSet.has(id)) {
                            targetIds.add(id)
                        }
                    }
                }
            }
        } else {
            for (const id of this.sids.keys()) {
                if (!exceptSet.has(id)) {
                    targetIds.add(id)
                }
            }
        }
        return targetIds
    }

    add(id, room) {
        if (!room) return

        let ids = this.rooms.get(room)
        if (!ids) {
            ids = new Set()
            this.rooms.set(room, ids)
        }
        ids.add(id)

        let socketRooms = this.sids.get(id)
        if (!socketRooms) {
            socketRooms = new Set()
            this.sids.set(id, socketRooms)
        }
        socketRooms.add(room)
    }

    addAll(id, rooms) {
        if (!rooms) return
        const roomsIterable = Array.isArray(rooms) || rooms instanceof Set ? rooms : [rooms]

        for (const room of roomsIterable) {
            this.add(id, room)
        }
    }

    del(id, rooms) {
        if (!rooms) return
        const roomsIterable = Array.isArray(rooms) || rooms instanceof Set ? rooms : [rooms]
        const socketRooms = this.sids.get(id)

        for (const room of roomsIterable) {
            const ids = this.rooms.get(room)
            if (ids) {
                ids.delete(id)

                if (ids.size === 0) {
                    this.rooms.delete(room)
                }
            }

            if (socketRooms) {
                socketRooms.delete(room)
            }
        }

        if (socketRooms && socketRooms.size === 0) {
            this.sids.delete(id)
        }
    }

    delAll(id) {
        const socketRooms = this.sids.get(id)
        if (!socketRooms) return

        for (const room of socketRooms) {
            const ids = this.rooms.get(room)
            if (ids) {
                ids.delete(id)
                if (ids.size === 0) {
                    this.rooms.delete(room)
                }
            }
        }
        this.sids.delete(id)
    }

    fetchSockets(opts = {}) {
        const targetIds = this._computeTargetIds(opts.rooms, opts.except)
        const result = []

        for (const id of targetIds) {
            const socket = this.nsp.sockets.get(id)
            if (socket) {
                result.push({
                    id: socket.id,
                    handshake: socket.handshake,
                    rooms: Array.from(this.sids.get(id) || []),
                    data: socket.data,
                })
            }
        }
        return result
    }

    getRoomSize(room) {
        const ids = this.rooms.get(room)
        return ids ? ids.size : 0
    }

    broadcast(packet, opts = {}) {
        const rooms = opts.rooms || new Set()
        const except = opts.except || new Set()

        const targetIds = this._computeTargetIds(rooms, except)

        // 2. Відправляємо пакети через Namespace
        for (const id of targetIds) {
            const socket = this.nsp.sockets.get(id)
            if (socket) {
                // Створюємо копію пакета з назвою САМЕ ЦІЄЇ кімнати
                // const roomPacket = {
                //     ...packet,
                //     metadata: { ...packet.metadata, room: room },
                // }

                // Викликаємо метод відправки самого сокета (який реалізує TCP/WebSocket write)
                socket._sendRaw(packet)
            }
        }
    }
}
