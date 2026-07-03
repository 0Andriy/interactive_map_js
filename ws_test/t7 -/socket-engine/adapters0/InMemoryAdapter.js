import { BaseAdapter } from './BaseAdapter.js'
import { v7 as uuidv7 } from 'uuid'

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
        /** @type {Map<string, Set<string>>} Зворотний індекс: Список кімнат для кожного сокета: SocketId -> Set(RoomName) */
        this.sids = new Map()
        /** @type {Map<string, NodeJS.Timeout>} Таймери відкладеного видалення сокетів: SocketId -> TimerId */
        this.graceTimers = new Map()
        /** @type {Map<string, Array<{packet: any, id: string}>>} Буфери повідомлень: RoomName -> Масив */
        this.roomBuffers = new Map()

        /** @type {number} Максимальний розмір буфера для однієї кімнати */
        this.maxBufferSize = 100
    }

    /**
     * Скасовує активний таймер видалення сокета, якщо він існує.
     * @private
     * @param {string} socketId - Ідентифікатор сокета.
     */
    #clearGraceTimer(socketId) {
        const timerId = this.graceTimers.get(socketId)
        if (timerId) {
            clearTimeout(timerId)
            this.graceTimers.delete(socketId)
        }
    }

    /**
     * Внутрішній метод для безпечного видалення сокета з конкретної кімнати.
     * @private
     * @param {string} socketId - Ідентифікатор сокета.
     * @param {string} roomName - Назва кімнати.
     */
    #removeSocketFromRoom(socketId, roomName) {
        const roomSocketIds = this.rooms.get(roomName)
        if (!roomSocketIds) return

        roomSocketIds.delete(socketId)

        if (roomSocketIds.size === 0) {
            this.rooms.delete(roomName)

            // Очищаємо пам'ять, якщо кімната порожня
            this.roomBuffers.delete(roomName)
        }
    }

    /**
     * Гарантує наявність унікального ID повідомлення всередині пакета для Connection Recovery.
     * @private
     * @param {any} packet - Об'єкт пакета даних.
     * @returns {string} ID повідомлення.
     */
    #ensureMessageId(packet) {
        if (typeof packet !== 'object' || packet === null) {
            return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        }

        if (!packet.meta) {
            packet.meta = {}
        }

        if (!packet.meta.id) {
            // Використовуємо криптографічно стійкий UUID, вбудований у Node.js
            packet.meta.id = uuidv7() || crypto.randomUUID()
        }

        return packet.meta.id
    }

    /**
     * Реєструє об'єкт сокета в системі.
     * @param {any} socket - Об'єкт сокет-з'єднання.
     */
    registerSocket(socket) {
        if (!socket || !socket?.id || typeof socket.id !== 'string') return

        this.#clearGraceTimer(socket.id)
        this.sockets.set(socket.id, socket)
    }

    /**
     * Додає сокет до кімнати.
     * @param {string} socketId - Ідентифікатор сокета.
     * @param {string} roomName - Назва кімнати.
     */
    add(socketId, roomName) {
        if (typeof socketId !== 'string' || typeof roomName !== 'string') return

        this.#clearGraceTimer(socketId)

        // Ініціалізація зв'язку Socket -> Rooms
        let socketRooms = this.sids.get(socketId)
        if (!socketRooms) {
            socketRooms = new Set()
            this.sids.set(socketId, socketRooms)
        }
        socketRooms.add(roomName)

        // Ініціалізація зв'язку Room -> Sockets
        let roomSocketIds = this.rooms.get(roomName)
        if (!roomSocketIds) {
            roomSocketIds = new Set()
            this.rooms.set(roomName, roomSocketIds)
        }
        roomSocketIds.add(socketId)
    }

    /**
     * Додає сокет до кількох кімнат одночасно.
     * @param {string} socketId - Ідентифікатор сокета.
     * @param {string|string[]} rooms - Масив назв кімнат.
     */
    addAll(socketId, rooms) {
        if (typeof socketId !== 'string') return

        // ЗАХИСТ: якщо прилетів не масив (наприклад, рядок чи undefined), перетворюємо в масив або ігноруємо
        if (!Array.isArray(rooms)) {
            // Авто-виправлення, якщо передали один рядок замість масиву
            if (typeof rooms === 'string') {
                this.add(socketId, rooms)
            }

            return
        }

        for (const roomName of rooms) {
            this.add(socketId, roomName)
        }
    }

    /**
     * Видаляє сокет із конкретної кімнати.
     * @param {string} socketId - Ідентифікатор сокета.
     * @param {string} roomName - Назва кімнати.
     */
    del(socketId, roomName) {
        if (typeof socketId !== 'string' || typeof roomName !== 'string') return

        this.#removeSocketFromRoom(socketId, roomName)

        const socketRooms = this.sids.get(socketId)
        if (socketRooms) {
            socketRooms.delete(roomName)

            if (socketRooms.size === 0) {
                this.sids.delete(socketId)
            }
        }
    }

    /**
     * Видаляє сокет з усіх кімнат (з можливістю відстрочки graceMs).
     * @param {string} socketId - Ідентифікатор сокета.
     * @param {number} [graceMs=0] - Час відстрочки у мілісекундах.
     * @param {Function|null} [onFinalCleanup=null] - Коллбек після остаточного очищення.
     */
    delAll(socketId, graceMs = 0, onFinalCleanup = null) {
        if (typeof socketId !== 'string') return

        const parsedGraceMs = Number(graceMs) || 0

        const cleanupAndNotify = () => {
            this.#executeFinalCleanup(socketId)
            if (typeof onFinalCleanup === 'function') onFinalCleanup()
        }

        if (parsedGraceMs <= 0) {
            cleanupAndNotify()
            return
        }

        this.#clearGraceTimer(socketId)

        const timerId = setTimeout(() => {
            cleanupAndNotify()
            this.graceTimers.delete(socketId)
        }, parsedGraceMs)

        this.graceTimers.set(socketId, timerId)
    }

    /**
     * Повне безповоротне видалення сокета зі сховища.
     * @private
     * @param {string} socketId - Ідентифікатор сокета.
     */
    #executeFinalCleanup(socketId) {
        const socketRooms = this.sids.get(socketId)

        // Видаляємо ID сокета з усіх кімнат, де він перебував
        if (socketRooms) {
            for (const roomName of socketRooms) {
                this.#removeSocketFromRoom(socketId, roomName)
            }
        }

        // Повне видалення структур та самого об'єкта сокета
        this.sids.delete(socketId)
        this.sockets.delete(socketId)
    }

    /**
     * Повертає масив пропущених пакетів для кімнати, починаючи з вказаного ID.
     * @param {string} roomName - Назва кімнати.
     * @param {string} lastMsgId - Унікальний індентифікатор останього повідомлення.
     * @returns {any[]} Масив пакетів даних
     */
    getMissedMessages(roomName, lastMsgId) {
        const buffer = this.roomBuffers.get(roomName)
        if (!buffer || !lastMsgId) return []

        const index = buffer.findIndex((m) => m.id === lastMsgId)
        if (index === -1) return [] // Повідомлення застаріло і вже видалено з буфера

        return buffer.slice(index + 1).map((m) => m.packet)
    }

    /**
     * Транслює пакет усім сокетам у кімнаті (або глобально).
     * @param {string|string[]|null} roomName - Назва кімнати, масив кімнат або null для всіх.
     * @param {any} packet - Дані для відправки.
     * @param {object} [opts={}] - Опції розсилки (except, volatile).
     */
    broadcast(roomName, packet, opts = {}) {
        // 1. Гарантуємо наявність ID повідомлення в об'єкті до серіалізації
        let msgId = null
        if (roomName !== null && !opts.volatile) {
            msgId = this.#ensureMessageId(packet)
        }

        // 2. Оптимальна серіалізація: робимо JSON.stringify тільки якщо прийшов об'єкт
        const payload = typeof packet === 'string' ? packet : JSON.stringify(packet)

        // 3. Глобальна розсилка усім підключеним сокетам (roomName === null)
        if (roomName === null) {
            // ЗАХИСТ: Від дублювання повідомлення одному сокету (якщо перебір по кімнатах)
            const sentSockets = new Set()

            for (const [socketId, socket] of this.sockets.entries()) {
                if (sentSockets.has(socketId)) continue

                if (socketId === opts.except) continue
                if (opts.volatile && socket?.rawWs?.bufferedAmount > 0) continue

                if (socket?.rawWs?.readyState === 1) {
                    socket.rawWs.send(payload)
                    sentSockets.add(socketId)
                }
            }
            return
        }

        // Нормалізуємо цільові кімнати в єдиний масив
        const targetRooms = Array.isArray(roomName) ? roomName : [roomName]

        // 4. Буферизація повідомлень для Connection Recovery
        if (!opts.volatile && msgId) {
            for (const room of targetRooms) {
                let buffer = this.roomBuffers.get(room)
                if (!buffer) {
                    buffer = []
                    this.roomBuffers.set(room, buffer)
                }

                buffer.push({ packet, id: msgId })
                if (buffer.length > this.maxBufferSize) buffer.shift()
            }
        }

        // 5. Збір унікальних одержувачів із вказаних кімнат
        const uniqueSocketIds = new Set()
        for (const room of targetRooms) {
            const roomSocketIds = this.rooms.get(room)
            if (roomSocketIds) {
                for (const id of roomSocketIds) {
                    uniqueSocketIds.add(id)
                }
            }
        }

        // 6. Адресна відправка зібраним сокетам
        for (const socketId of uniqueSocketIds) {
            if (socketId === opts.except) continue

            const socket = this.sockets.get(socketId)
            if (!socket) continue

            if (opts.volatile && socket?.rawWs?.bufferedAmount > 0) continue
            if (socket?.rawWs?.readyState === 1) {
                socket.rawWs.send(payload)
            }
        }
    }

    /**
     * Повертає список сокетів (повні об'єкти) з можливістю фільтрації по кімнаті.
     * @param {string|null} [roomName=null] - Назва кімнати для фільтрації, або null для всіх сокетів.
     * @returns {Promise<any[]>} Масив активних об'єктів сокетів.
     */
    async fetchSockets(roomName = null) {
        if (roomName) {
            const socketIds = this.rooms.get(roomName)
            if (!socketIds || socketIds.size === 0) return []

            const result = []
            for (const id of socketIds) {
                const socket = this.sockets.get(id)

                if (socket) {
                    result.push(socket)
                }
            }
            return result
        }

        // Якщо кімнату не вказано, повертаємо взагалі всі активні сокети системи
        return Array.from(this.sockets.values())
    }
}
