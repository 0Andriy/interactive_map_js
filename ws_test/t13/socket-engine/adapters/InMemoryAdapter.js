import { BaseAdapter } from './BaseAdapter.js'

/**
 * In-Memory адаптер для керування кімнатами та сокетами в межах одного вузла (процесу).
 * Зберігає зв'язки між сокетами та кімнатами у двонаправлених картах (Maps).
 *
 * @extends BaseAdapter
 */
export class InMemoryAdapter extends BaseAdapter {
    /**
     * Створює екземпляр InMemoryAdapter.
     * @param {Object} namespace - Простір імен (Namespace), до якого прив'язаний адаптер.
     */
    constructor(namespace) {
        super(namespace)

        /**
         * Карта кімнат, де ключ — назва кімнати, а значення — Set із ID сокетів.
         * Кімнати та ID сокетів у них (індекс).
         * @type {Map<string, Set<string>>} RoomName -> Set(SocketId)
         */
        this.rooms = new Map()

        /**
         * Карта сокетів, де ключ — ID сокета, а значення — Set із назв кімнат, у яких він перебуває.
         * Список кімнат для кожного сокета (дзеркальний індекс).
         * @type {Map<string, Set<string>>} SocketId -> Set(RoomName)
         */
        this.sids = new Map()
    }

    /**
     * Додає сокет до конкретної кімнати.
     *
     * @param {string} socketId - Унікальний ідентифікатор сокета.
     * @param {string} roomName - Назва кімнати.
     * @returns {void}
     */
    add(socketId, roomName) {
        // Захист типів: ігноруємо некоректні вхідні дані
        if (typeof socketId !== 'string' || typeof roomName !== 'string') return

        // 1. Прив'язуємо ID сокета до кімнати
        let roomSocketIds = this.rooms.get(roomName)
        if (!roomSocketIds) {
            roomSocketIds = new Set()
            this.rooms.set(roomName, roomSocketIds)
        }
        roomSocketIds.add(socketId)

        // 2. Прив'язуємо кімнату до сокета (двонаправлений зв'язок)
        let socketRooms = this.sids.get(socketId)
        if (!socketRooms) {
            socketRooms = new Set()
            this.sids.set(socketId, socketRooms)
        }
        socketRooms.add(roomName)
    }

    /**
     * Додає сокет до кількох кімнат одночасно.
     *
     * @param {string} socketId - Унікальний ідентифікатор сокета.
     * @param {string|string[]|Set<string>} rooms - Одна кімната, масив або Set кімнат.
     * @returns {void}
     */
    addAll(socketId, rooms) {
        if (typeof socketId !== 'string' || !rooms) return

        // Уніфікуємо перебір: підтримуємо Set, масиви та поодинокі рядки
        if (rooms instanceof Set || Array.isArray(rooms)) {
            for (const roomName of rooms) {
                this.add(socketId, roomName)
            }
        } else if (typeof rooms === 'string') {
            this.add(socketId, rooms)
        }
    }

    /**
     * Видаляє сокет з конкретної кімнати.
     *
     * @param {string} socketId - Унікальний ідентифікатор сокета.
     * @param {string} roomName - Назва кімнати.
     * @returns {void}
     */
    del(socketId, roomName) {
        if (typeof socketId !== 'string' || typeof roomName !== 'string') return

        // 1. Видаляємо ID сокета з колекції кімнати
        const roomSocketIds = this.rooms.get(roomName)
        if (roomSocketIds) {
            roomSocketIds.delete(socketId)
            // Очищення пам'яті: якщо в кімнаті нікого не залишилось, видаляємо її з Map
            if (roomSocketIds.size === 0) {
                this.rooms.delete(roomName)
            }
        }

        // 2. Видаляємо кімнату з колекції сокета
        const socketRooms = this.sids.get(socketId)
        if (socketRooms) {
            socketRooms.delete(roomName)
            // Очищення пам'яті: якщо у сокета немає кімнат, видаляємо його з Map
            if (socketRooms.size === 0) {
                this.sids.delete(socketId)
            }
        }
    }

    /**
     * Повністю видаляє сокет з усіх кімнат (наприклад, при відключенні клієнта).
     *
     * @param {string} socketId - Унікальний ідентифікатор сокета.
     * @returns {void}
     */
    delAll(socketId) {
        if (typeof socketId !== 'string') return

        const socketRooms = this.sids.get(socketId)
        if (!socketRooms) return

        // Створюємо поверхневу копію через [...spread], щоб безпечно видаляти елементи під час ітерації
        for (const roomName of [...socketRooms]) {
            const roomSocketIds = this.rooms.get(roomName)
            if (roomSocketIds) {
                roomSocketIds.delete(socketId)
                // Очищення пам'яті: якщо в кімнаті нікого не залишилось, видаляємо її з Map
                if (roomSocketIds.size === 0) {
                    this.rooms.delete(roomName)
                }
            }
        }

        // Повністю прибираємо сокет з реєстру sids
        this.sids.delete(socketId)
    }

    /**
     * Допоміжний приватний метод для нормалізації вхідних параметрів кімнат/виключень.
     * Запобігає посимвольному розщепленню рядків у `new Set('string')`.
     *
     * @private
     * @param {string|string[]|Set<string>} [val] - Значення для парсингу.
     * @returns {Set<string>} Уніфікований набір рядків.
     */
    _parseOptions(val) {
        if (!val) return new Set()
        if (val instanceof Set) return val
        if (typeof val === 'string') return new Set([val])
        return new Set(val) // Працює для масивів та інших ітерованих об'єктів
    }

    /**
     * Внутрішній метод для збору унікальних ID сокетів на основі фільтрів кімнат та виключень.
     *
     * @private
     * @param {BroadcastOptions} [opts={}] - Опції фільтрації (кімнати та виключення).
     * @returns {Set<string>} Набір цільових ID сокетів (targets).
     */
    _getTargets(opts = {}) {
        const rooms = this._parseOptions(opts.rooms)
        const except = this._parseOptions(opts.except)
        const targets = new Set()

        if (rooms.size > 0) {
            // Якщо вказано кімнати, збираємо сокети лише з цих кімнат
            for (const room of rooms) {
                const clients = this.rooms.get(room)
                if (clients) {
                    clients.forEach((id) => targets.add(id))
                }
            }
        } else if (this.nsp && this.nsp.sockets) {
            // Якщо кімнат немає — цільовими є абсолютно всі сокети у просторі імен (глобальна розсилка)
            this.nsp.sockets.forEach((_, id) => targets.add(id))
        }

        // Видаляємо зі списку отримувачів усіх, хто потрапив у список виключень (except)
        except.forEach((id) => {
            // Якщо у виключення передали назву кімнати, видаляємо всіх її учасників
            const exceptRoomClients = this.rooms.get(id)
            if (exceptRoomClients) {
                exceptRoomClients.forEach((socketId) => targets.delete(socketId))
            } else {
                // Якщо це ID конкретного сокета, видаляємо безпосередньо його
                targets.delete(id)
            }
        })

        return targets
    }

    /**
     * Транслює сирий пакет даних усім цільовим сокетам відповідно до фільтрів.
     *
     * @param {any} packet - Об'єкт або дані пакета для надсилання.
     * @param {BroadcastOptions} [opts={}] - Параметри трансляції.
     * @param {string[]|Set<string>} [opts.rooms] - Цільові кімнати.
     * @param {string[]|Set<string>} [opts.except] - Кімнати або ID, які треба виключити.
     * @returns {void}
     */
    broadcast(packet, opts = {}) {
        const targets = this._getTargets(opts)

        // Перебираємо отримані ID та відправляємо дані через локальні об'єкти сокетів
        for (const id of targets) {
            const socket = this.nsp?.sockets?.get(id)
            // Викликаємо низькорівневий метод відправки, якщо він доступний
            if (socket && typeof socket.sendRaw === 'function') {
                socket.sendRaw(packet)
            }
        }
    }

    /**
     * Повертає список реальних об'єктів сокетів, що відповідають критеріям фільтрації.
     *
     * @param {BroadcastOptions} [opts={}] - Параметри фільтрації сокетів.
     * @param {string[]|Set<string>} [opts.rooms] - Фільтр за кімнатами.
     * @param {string[]|Set<string>} [opts.except] - Список сокетів/кімнат для виключення.
     * @returns {Promise<Array<Object>>} Проміс, який повертає масив активних об'єктів сокетів.
     */

    async fetchSockets(opts = {}) {
        const targets = this._getTargets(opts)
        const socketObjects = []

        // return Array.from(targets)

        // Мапимо ID сокетів на їхні реальні екземпляри у пам'яті
        for (const id of targets) {
            const socket = this.nsp?.sockets?.get(id)
            if (socket) {
                socketObjects.push(socket)
            }
        }

        return socketObjects
    }

    // ---------------------------------

    /**
     * Змушує сокети, що відповідають фільтру, увійти до вказаних кімнат.
     * Корисно для масового керування кімнатами з боку сервера.
     *
     * @param {Object} opts - Параметри фільтрації сокетів (rooms, except).
     * @param {string|string[]} rooms - Кімнати, в які потрібно додати сокети.
     * @returns {Promise<void>}
     */
    async socketsJoin(opts, rooms) {
        const targetSockets = await this.fetchSockets(opts)
        const roomsArray = Array.isArray(rooms) ? rooms : [rooms]

        for (const socket of targetSockets) {
            this.addAll(socket.id, roomsArray)
        }
    }

    /**
     * Змушує сокети, що відповідають фільтру, вийти зі вказаних кімнат.
     *
     * @param {Object} opts - Параметри фільтрації сокетів (rooms, except).
     * @param {string|string[]} rooms - Кімнати, з яких потрібно видалити сокети.
     * @returns {Promise<void>}
     */
    async socketsLeave(opts, rooms) {
        const targetSockets = await this.fetchSockets(opts)
        const roomsArray = Array.isArray(rooms) ? rooms : [rooms]

        for (const socket of targetSockets) {
            for (const room of roomsArray) {
                this.del(socket.id, room)
            }
        }
    }

    /**
     * Відключає всі сокети, що відповідають критеріям фільтрації.
     *
     * @param {Object} opts - Параметри фільтрації сокетів (rooms, except).
     * @param {boolean} [close=false] - Чи закривати базове з'єднання (true для розриву TCP-сесії).
     * @returns {Promise<void>}
     */
    async disconnectSockets(opts, close = false) {
        const targetSockets = await this.fetchSockets(opts)

        for (const socket of targetSockets) {
            if (typeof socket.disconnect === 'function') {
                socket.disconnect(close)
            }
        }
    }
}
