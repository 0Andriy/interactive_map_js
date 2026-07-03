import { BaseAdapter } from './BaseAdapter.js'

export class InMemoryAdapter extends BaseAdapter {
    constructor(nsp) {
        super(nsp)

        /** @type {Map<string, Set<string>>} НазваКімнати -> Set(socketId) */
        this.rooms = new Map()

        /** @type {Map<string, Set<string>>} socketId -> Set(НазваКімнати) */
        this.sids = new Map()
    }

    // ==========================================
    // 1. УПРАВЛІННЯ КІМНАТАМИ (ROOM MANAGEMENT)
    // ==========================================

    /** @override */
    add(socketId, roomName) {
        // 1. Оновлюємо індекс кімнат
        if (!this.rooms.has(roomName)) {
            this.rooms.set(roomName, new Set())
        }
        this.rooms.get(roomName).add(socketId)

        // 2. Оновлюємо індекс сокетів
        if (!this.sids.has(socketId)) {
            this.sids.set(socketId, new Set())
        }
        this.sids.get(socketId).add(roomName)
    }

    /** @override */
    addAll(socketId, rooms) {
        for (const roomName of rooms) {
            this.add(socketId, roomName)
        }
    }

    /** @override */
    del(socketId, roomName) {
        // 1. Видаляємо сокет з кімнати
        const socketIdsSet = this.rooms.get(roomName)
        if (socketIdsSet) {
            socketIdsSet.delete(socketId)
            // Якщо кімната стала порожньою, видаляємо її з пам'яті, щоб не було витоку
            if (socketIdsSet.size === 0) {
                this.rooms.delete(roomName)
            }
        }

        // 2. Видаляємо кімнату з індексу сокета
        const roomsSet = this.sids.get(socketId)
        if (roomsSet) {
            roomsSet.delete(roomName)
            if (roomsSet.size === 0) {
                this.sids.delete(socketId)
            }
        }
    }

    /** @override */
    delAll(socketId) {
        const roomsSet = this.sids.get(socketId)
        if (!roomsSet) return

        // Ітеруємося по всіх кімнатах, де сидів сокет, і чистимо його звідти
        for (const roomName of roomsSet) {
            const socketIdsSet = this.rooms.get(roomName)
            if (socketIdsSet) {
                socketIdsSet.delete(socketId)
                if (socketIdsSet.size === 0) {
                    this.rooms.delete(roomName)
                }
            }
        }

        // Повністю видаляємо запис про сокет
        this.sids.delete(socketId)
    }

    // ==========================================
    // 2. ІНФОРМАЦІЯ ПРО СТАН (INTROSPECTION)
    // ==========================================

    /** @override */
    getRoomsBySocket(socketId) {
        const roomsSet = this.sids.get(socketId)
        // Повертаємо копію, щоб ззовні ніхто випадково не поламав наш внутрішній Set
        return roomsSet ? new Set(roomsSet) : new Set()
    }

    /** @override */
    async fetchSockets(opts = {}) {
        // Якщо передано конкретну кімнату для фільтрації
        if (opts.room) {
            const socketIdsSet = this.rooms.get(opts.room)
            if (!socketIdsSet || socketIdsSet.size === 0) return []

            const result = []
            for (const id of socketIdsSet) {
                // nsp.sockets — це Map живих локальних з'єднань на вашому майбутньому сервері
                const socket = this.nsp.sockets.get(id)
                if (socket) result.push(socket)
            }
            return result
        }

        // Якщо фільтр по кімнаті порожній, віддаємо взагалі всі живі сокети простору імен
        return Array.from(this.nsp.sockets.values())
    }

    // ==========================================
    // 3. МАРШРУТИЗАЦІЯ ПОВІДОМЛЕНЬ (BROADCASTING)
    // ==========================================

    /** @override */
    broadcast(packet, opts) {
        const rooms = opts.rooms || new Set()
        const except = opts.except || new Set()
        const targetSocketIds = new Set()

        // Етап 1: Збір кандидатів на отримання повідомлення
        if (rooms.size > 0) {
            // Сценарій А: Шлемо у конкретні кімнати
            for (const roomName of rooms) {
                const socketIdsSet = this.rooms.get(roomName)
                if (socketIdsSet) {
                    for (const id of socketIdsSet) {
                        targetSocketIds.add(id)
                    }
                }
            }
        } else {
            // Сценарій Б: Якщо масив кімнат порожній, шлемо абсолютно ВСІМ підключеним сокетам
            for (const id of this.sids.keys()) {
                targetSocketIds.add(id)
            }
        }

        // Етап 2: Фільтрація винятків (except) та відправка
        for (const id of targetSocketIds) {
            // Якщо сокет є у списку винятків, ігноруємо його
            if (except.has(id)) continue

            // Отримуємо живий об'єкт сокета з нашого Namespace
            const socket = this.nsp.sockets.get(id)
            if (socket) {
                // Викликаємо низькорівневий метод відправки у клієнтський TCP/WebSocket тайтл
                // (Назва методу залежить від вашої реалізації сокета, наприклад socket.write або socket.sendBuffer)
                socket.sendPacket(packet, opts.flags)
            }
        }
    }
}
