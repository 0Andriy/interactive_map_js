import { BaseAdapter } from './BaseAdapter.js'

/**
 * Високопродуктивний асинхронний локальний адаптер для роботи в пам'яті.
 * Повністю захищений від некоректних типів та готовий до High-Load.
 * Оперує виключно ідентифікаторами (socketId) та кімнатами.
 */
export class InMemoryAdapter extends BaseAdapter {
    /**
     * @param {object} nsp - Простір імен (Namespace), якому належить цей адаптер.
     */
    constructor(nsp) {
        super(nsp)

        /**
         * Мапа зв'язків (Індекс): Назва кімнати -> Set з унікальними ID підписників (sids).
         * Індекс кімнат: НазваКімнати -> Set(socketId)
         * @type {Map<string, Set<string>>}
         * @public
         */
        this.rooms = new Map()

        /**
         * Мапа зв'язків (Індекс): ID підписника (sid) -> Set назв кімнат, у яких він перебуває.
         * Індекс сокетів: socketId -> Set(НазваКімнати)
         * @type {Map<string, Set<string>>}
         * @public
         */
        this.sids = new Map()
    }

    // ==========================================
    // 1. УПРАВЛІННЯ КІМНАТАМИ (ROOM MANAGEMENT)
    // ==========================================

    /**
     * Додає сокет до конкретної кімнати.
     * @override
     * @param {string} socketId - Унікальний ID сокета.
     * @param {string} roomName - Назва кімнати.
     * @returns {Promise<void>}
     */
    async add(socketId, roomName) {
        // ЗАХИСТ: Перевірка типів вхідних даних
        if (!socketId || typeof socketId !== 'string') {
            return
        }

        if (!roomName || typeof roomName !== 'string') {
            return
        }

        // 1. Оновлюємо індекс кімнат
        let socketIdsSet = this.rooms.get(roomName)
        if (!socketIdsSet) {
            socketIdsSet = new Set()
            this.rooms.set(roomName, socketIdsSet)
        }
        socketIdsSet.add(socketId)

        // 2. Оновлюємо індекс сокетів
        let roomsSet = this.sids.get(socketId)
        if (!roomsSet) {
            roomsSet = new Set()
            this.sids.set(socketId, roomsSet)
        }
        roomsSet.add(roomName)
    }

    /**
     * Додає сокет до кількох кімнат одночасно.
     * @override
     * @param {string} socketId - Унікальний ID сокета.
     * @param {string[]|Set<string>} rooms - Набори назв кімнат.
     * @returns {Promise<void>}
     */
    async addAll(socketId, rooms) {
        if (typeof socketId !== 'string' || !socketId || !rooms) return

        // Перетворюємо в масив, якщо прийшов Set, або залишаємо масивом
        const roomsList = rooms instanceof Set ? [...rooms] : rooms

        // Безпечно перебираємо звичайний масив
        if (Array.isArray(roomsList)) {
            const len = roomsList.length

            for (let i = 0; i < len; i++) {
                await this.add(socketId, roomsList[i])
            }
        }
    }

    /**
     * Видаляє сокет з конкретної кімнати.
     * @override
     * @param {string} socketId - ID сокета.
     * @param {string} roomName - Назва кімнати.
     * @returns {Promise<void>}
     */
    async del(socketId, roomName) {
        if (!socketId || typeof socketId !== 'string') {
            return
        }

        if (!roomName || typeof roomName !== 'string') {
            return
        }

        // 1. Видаляємо сокет з кімнати
        const socketIdsSet = this.rooms.get(roomName)
        if (socketIdsSet) {
            socketIdsSet.delete(socketId)

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

    /**
     * Повністю видаляє сокет з усіх кімнат (при дисконекті).
     * @override
     * @param {string} socketId - ID сокета.
     * @returns {Promise<void>}
     */
    async delAll(socketId) {
        if (typeof socketId !== 'string' || !socketId) return

        const roomsSet = this.sids.get(socketId)
        if (!roomsSet || roomsSet.size === 0) return

        // ЗАХИСТ МУТАЦІЇ: безпечна копія елементів перед ітерацією
        const roomsCopy = [...roomsSet]
        const len = roomsCopy.length

        for (let i = 0; i < len; i++) {
            const roomName = roomsCopy[i]
            const socketIdsSet = this.rooms.get(roomName)
            if (socketIdsSet) {
                socketIdsSet.delete(socketId)
                if (socketIdsSet.size === 0) {
                    this.rooms.delete(roomName)
                }
            }
        }

        this.sids.delete(socketId)
    }

    // ==========================================
    // 2. ІНФОРМАЦІЯ ПРО СТАН (INTROSPECTION)
    // ==========================================

    /**
     * Повертає список кімнат, у яких перебуває сокет.
     * @override
     * @param {string} socketId - ID сокета.
     * @returns {Promise<Set<string>>} Копія сету кімнат (async для Redis).
     */
    async getRoomsBySocket(socketId) {
        if (typeof socketId !== 'string' || !socketId) return new Set()

        const roomsSet = this.sids.get(socketId)
        return roomsSet ? new Set(roomsSet) : new Set()
    }

    /**
     * Повертає масив живих об'єктів сокетів відповідно до переданих фільтрів.
     * @override
     * @param {object} [opts={}] - Опції вибірки.
     * @param {string} [opts.room] - Назва кімнати для фільтрації сокетів.
     * @returns {Promise<object[]>} Масив локальних об'єктів Socket.
     */
    async fetchSockets(opts = {}) {
        const result = []

        // ЗАХИСТ: Перевірка наявності Map сокетів у просторі імен
        if (!this.nsp?.sockets || typeof this.nsp.sockets.values !== 'function') {
            return result
        }

        // Сценарій А: Якщо передано конкретну кімнату для фільтрації
        if (opts && typeof opts.room === 'string' && opts.room) {
            const socketIdsSet = this.rooms.get(opts.room)
            if (!socketIdsSet || socketIdsSet.size === 0) return result

            for (const id of socketIdsSet) {
                const socket = this.nsp.sockets.get(id)
                if (socket) result.push(socket)
            }
            return result
        }

        // Сценарій Б: Фільтр порожній, віддаємо взагалі всі живі сокети простору імен
        for (const socket of this.nsp.sockets.values()) {
            if (socket) result.push(socket)
        }
        return result
    }

    // ==========================================
    // 3. МАРШРУТИЗАЦІЯ ПОВІДОМЛЕНЬ (BROADCASTING)
    // ==========================================

    /**
     * Низькорівневий метод трансляції пакетів Socket.IO.
     * @override
     * @param {object} packet - Сирий об'єкт пакета.
     * @param {object} opts - Опції ланцюжка від BroadcastOperator.
     * @param {Set<string>} [opts.rooms] - Цільові кімнати.
     * @param {Set<string>} [opts.except] - Кімнати-виключення.
     * @param {object} [opts.flags] - Прапорці розсилки.
     * @returns {Promise<void>}
     */
    async broadcast(packet, opts) {
        // ЗАХИСТ: Перевірка наявності пакета та опцій
        if (!packet || !opts) return
        if (!this.nsp?.sockets) return

        // Гарантуємо наявність потрібних структур, навіть якщо оператор передав порожнечу
        const rooms = opts.rooms instanceof Set ? opts.rooms : new Set()
        const except = opts.except instanceof Set ? opts.except : new Set()
        const flags = opts.flags && typeof opts.flags === 'object' ? opts.flags : {}

        const targetSocketIds = new Set()

        // Етап 1: Збір кандидатів на отримання повідомлення
        if (rooms.size > 0) {
            for (const roomName of rooms) {
                if (typeof roomName !== 'string') continue

                const socketIdsSet = this.rooms.get(roomName)
                if (socketIdsSet) {
                    for (const id of socketIdsSet) {
                        targetSocketIds.add(id)
                    }
                }
            }
        } else {
            // Якщо кімнат немає — збираємо абсолютно всі локальні сокети
            for (const id of this.sids.keys()) {
                targetSocketIds.add(id)
            }
        }

        // Етап 2: Фільтрація винятків (except та sender)
        for (const id of targetSocketIds) {
            // 1. Фільтр відправника (.broadcast)
            if (flags.sender && flags.sender === id) {
                continue
            }

            // 2. Фільтр кімнат-виключень (.except)
            if (except.size > 0) {
                const socketRooms = this.sids.get(id)
                if (socketRooms) {
                    const isInExceptRoom = [...socketRooms].some((r) => except.has(r))
                    if (isInExceptRoom) continue
                }
            }

            // Отримуємо живий об'єкт сокета та робимо відправку
            const socket = this.nsp.sockets.get(id)
            // ЗАХИСТ: Перевірка наявності методу відправки в об'єкті сокета
            if (socket && typeof socket.sendPacket === 'function') {
                socket.sendPacket(packet, flags)
            }
        }
    }

    /**
     * Головна аналітична функція адаптера.
     * Приймає інструкцію від BroadcastOperator і повертає масив id сокетів, які підходять під фільтр.
     * @param {object} instruction - Об'єкт інструкції від BroadcastOperator.
     * @returns {Promise<string[]>} Масив унікальних ID сокетів.
     */
    async filterSids(instruction) {
        const { rooms, except, flags } = instruction
        const resultSids = new Set()

        if (rooms && rooms.size > 0) {
            for (const room of rooms) {
                const roomSids = this.rooms.get(room)
                if (roomSids) {
                    for (const id of roomSids) resultSids.add(id)
                }
            }
        } else {
            // Якщо кімнат немає, кандидатами є абсолютно всі сокети, відомі адаптеру
            for (const id of this.sids.keys()) resultSids.add(id)
        }

        // Застосовуємо виключення
        for (const id of resultSids) {
            if (flags.sender && flags.sender === id) {
                resultSids.delete(id)
                continue
            }

            if (except && except.size > 0) {
                const userRooms = this.sids.get(id)
                if (userRooms && [...userRooms].some((r) => except.has(r))) {
                    resultSids.delete(id)
                }
            }
        }

        return [...resultSids]
    }
}
