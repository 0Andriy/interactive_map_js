import { BaseAdapter } from './BaseAdapter.js'

/**
 * Адаптер для збереження кімнат та сокетів у пам'яті процесу.
 * @extends BaseAdapter
 */
export class InMemoryAdapter extends BaseAdapter {
    /**
     * Створює екземпляр InMemoryAdapter.
     * @param {string} nspName - Унікальне ім'я простору імен.
     */
    constructor(nspName) {
        super(nspName)

        /** @type {Map<string, any>} Глобальне сховище об'єктів сокетів: SocketId -> Socket */
        this.sockets = new Map()
        /** @type {Map<string, Set<string>>} Кімнати та ID сокетів у них: RoomName -> Set(SocketId) */
        this.rooms = new Map()
        /** @type {Map<string, Set<string>>} Список кімнат для кожного сокета: SocketId -> Set(RoomName) */
        this.sids = new Map()
        /** @type {Map<string, NodeJS.Timeout>} Таймери відкладеного видалення сокетів: SocketId -> TimerId */
        this.graceTimers = new Map()

        // Конфігурація Connection Recovery
        this.roomBuffers = new Map()
        this.maxBufferSize = 100
    }

    /**
     * Реєструє об'єкт сокета у внутрішній базі адаптера.
     * Слід викликати один раз під час підключення клієнта.
     * @param {any} socket - Об'єкт сокет-з'єднання, що має властивість .id
     */
    registerSocket(socket) {
        // Захист від некоректного об'єкта
        if (!socket || typeof socket.id !== 'string') return

        const socketId = socket.id

        // Скасовуємо таймер видалення, якщо сокет перепідключився
        const timerId = this.graceTimers.get(socketId)
        if (timerId) {
            clearTimeout(timerId)
            this.graceTimers.delete(socketId)
        }

        this.sockets.set(socketId, socket)
    }

    /**
     * Додає сокет до однієї конкретної кімнати за його ID.
     * @param {string} socketId - Ідентифікатор сокета.
     * @param {string} roomName - Назва кімнати.
     */
    add(socketId, roomName) {
        // Захист типів
        if (typeof socketId !== 'string' || typeof roomName !== 'string') return

        // Скасовуємо таймер, якщо він існує
        const timerId = this.graceTimers.get(socketId)
        if (timerId) {
            clearTimeout(timerId)
            this.graceTimers.delete(socketId)
        }

        // Прив'язуємо кімнату до сокета
        let socketRooms = this.sids.get(socketId)
        if (!socketRooms) {
            socketRooms = new Set()
            this.sids.set(socketId, socketRooms)
        }
        socketRooms.add(roomName)

        // Прив'язуємо ID сокета до кімнати
        let roomSocketIds = this.rooms.get(roomName)
        if (!roomSocketIds) {
            roomSocketIds = new Set()
            this.rooms.set(roomName, roomSocketIds)
        }
        roomSocketIds.add(socketId)
    }

    /**
     * Додає сокет до масиву кімнат.
     * @param {string} socketId - Ідентифікатор сокета.
     * @param {string[]} rooms - Масив назв кімнат.
     */
    addAll(socketId, rooms) {
        if (typeof socketId !== 'string') return

        // ЗАХИСТ: якщо прилетів не масив (наприклад, рядок чи undefined), перетворюємо в масив або ігноруємо
        if (!Array.isArray(rooms)) {
            if (typeof rooms === 'string') {
                this.add(socketId, rooms) // Авто-виправлення, якщо передали один рядок замість масиву
            }
            return
        }

        for (const roomName of rooms) {
            this.add(socketId, roomName)
        }
    }

    /**
     * Видаляє сокет із конкретної кімнати за його ID.
     * @param {string} socketId - Ідентифікатор сокета.
     * @param {string} roomName - Назва кімнати.
     */
    del(socketId, roomName) {
        if (typeof socketId !== 'string' || typeof roomName !== 'string') return

        // Видаляємо ID сокета з кімнати
        const roomSocketIds = this.rooms.get(roomName)
        if (roomSocketIds) {
            roomSocketIds.delete(socketId)
            if (roomSocketIds.size === 0) {
                this.rooms.delete(roomName)
                // Очищаємо застарілий буфер повідомлень кімнати, якщо в ній більше нікого немає
                this.roomBuffers.delete(roomName)
            }
        }

        // Видаляємо кімнату зі списку сокета
        const socketRooms = this.sids.get(socketId)
        if (socketRooms) {
            socketRooms.delete(roomName)
            if (socketRooms.size === 0) {
                this.sids.delete(socketId)
            }
        }
    }

    /**
     * Запускає процес видалення сокета з усіх кімнат та повної деактивації (можливо з відстрочкою).
     * @param {string} socketId - Ідентифікатор сокета.
     * @param {number} [graceMs=0] - Час відстрочки у мілісекундах.
     * @param {Function|null} [onFinalCleanup=null] - Коллбек після остаточного очищення.
     */
    delAll(socketId, graceMs = 0, onFinalCleanup = null) {
        if (typeof socketId !== 'string') return

        const parsedGraceMs = Number(graceMs) || 0

        if (parsedGraceMs <= 0) {
            this.#executeFinalCleanup(socketId)
            if (typeof onFinalCleanup === 'function') onFinalCleanup()
            return
        }

        const timerId = setTimeout(() => {
            this.#executeFinalCleanup(socketId)
            this.graceTimers.delete(socketId)
            if (typeof onFinalCleanup === 'function') onFinalCleanup()
        }, parsedGraceMs)

        this.graceTimers.set(socketId, timerId)
    }

    /**
     * Внутрішній приватний метод для повного вичищення сокета з системи та пам'яті.
     * @private
     * @param {string} socketId - Ідентифікатор сокета.
     */
    #executeFinalCleanup(socketId) {
        const socketRooms = this.sids.get(socketId)

        // Видаляємо ID сокета з усіх кімнат, де він перебував
        if (socketRooms) {
            for (const roomName of [...socketRooms]) {
                const roomSocketIds = this.rooms.get(roomName)
                if (roomSocketIds) {
                    roomSocketIds.delete(socketId)
                    if (roomSocketIds.size === 0) {
                        this.rooms.delete(roomName)
                        this.roomBuffers.delete(roomName)
                    }
                }
            }
        }

        // Повне видалення структур та самого об'єкта сокета
        this.sids.delete(socketId)
        this.sockets.delete(socketId)
    }

    /**
     * Повертає масив пропущених повідомлень для кімнати.
     */
    getMissedMessages(roomName, lastMsgId) {
        const buffer = this.roomBuffers.get(roomName)
        if (!buffer || !lastMsgId) return []

        const index = buffer.findIndex((m) => m.id === lastMsgId)
        if (index === -1) return [] // Занадто старе (вилетіло з буфера)

        return buffer.slice(index + 1).map((m) => m.packet)
    }

    /**
     * Транслює пакет усім сокетам у кімнаті або взагалі всім підключеним сокетам (якщо roomName === null).
     * @param {string|null} roomName - Назва кімнати або null для глобальної розсилки.
     * @param {any} packet - Об'єкт даних для відправки.
     * @param {object} [opts={}] - Опції розсилки.
     * @param {string} [opts.except] - Ідентифікатор сокета, який треба виключити.
     * @param {boolean} [opts.volatile] - Якщо true, пропускати сокети з повним буфером відправки.
     */
    broadcast(roomName, packet, opts = {}) {
        const payload = JSON.stringify(packet)

        // Буферизація для Connection Recovery
        if (roomName && !opts.volatile) {
            const targetRooms = Array.isArray(roomName) ? roomName : [roomName]

            for (const room of targetRooms) {
                let buffer = this.roomBuffers.get(room)
                if (!buffer) {
                    buffer = []
                    this.roomBuffers.set(room, buffer)
                }

                buffer.push({ packet, id: packet.meta?.id })

                if (buffer.length > this.maxBufferSize) buffer.shift()
            }
        }

        // Глобальна розсилка (можна перебрати усі кімнати замість sockets)
        if (roomName === null) {
            const sentSockets = new Set()

            for (const [socketId, socket] of this.sockets.entries()) {
                if (sentSockets.has(socketId)) continue

                if (socketId === opts?.except) continue
                if (opts?.volatile && socket?.rawWs?.bufferedAmount > 0) continue

                if (socket?.rawWs?.readyState === 1) {
                    socket.rawWs.send(payload)
                    sentSockets.add(socketId)
                }
            }
            return
        }

        // 2. Обробка розсилки у список кімнат (масив)
        // Якщо прийшов один рядок, загортаємо його в масив
        const targetRooms = Array.isArray(roomName) ? roomName : [roomName]

        // Set для збору унікальних ID сокетів з усіх вказаних кімнат
        const uniqueSocketIds = new Set()

        for (const room of targetRooms) {
            const roomSocketIds = this.rooms.get(room)
            if (!roomSocketIds) continue

            for (const id of roomSocketIds) {
                uniqueSocketIds.add(id) // Завдяки Set кожен ID збережеться лише ОДИН раз
            }
        }

        // 3. Безпечно відправляємо повідомлення унікальним клієнтам
        for (const socketId of uniqueSocketIds) {
            if (socketId === opts?.except) continue

            const socket = this.sockets.get(socketId)
            if (!socket) continue

            if (opts?.volatile && socket?.rawWs?.bufferedAmount > 0) continue
            if (socket?.rawWs?.readyState === 1) socket.rawWs.send(payload)
        }
    }

    /**
     * Отримує список усіх кімнат та ID сокетів, які в них знаходяться.
     * @async
     * @returns {Promise<Record<string, string[]>>} Об'єкт типу { назваКімнати: [idСокетів] }
     */
    async fetchSockets() {
        const localData = {}
        for (const [roomName, socketIdsSet] of this.rooms.entries()) {
            localData[roomName] = Array.from(socketIdsSet)
        }
        return localData
    }
}
