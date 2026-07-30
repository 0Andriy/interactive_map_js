/**
 * @typedef {Object} BroadcastFlags
 * @property {boolean} [volatile] - Чи надсилати пакет без гарантії доставки.
 * @property {boolean} [local] - Чи обмежувати трансляцію лише поточним сервером (ігноруючи Redis кластер).
 * @property {number} [timeout] - Тайм-аут для очікування відповідей (acknowledgements) від клієнтів.
 */

/**
 * Розширений оператор для побудови ланцюжків умов трансляції (наприклад, io.to().volatile.local.emit()).
 * Накопичує фільтри кімнат, виключення та прапорці оптимізації відправки.
 */
export class BroadcastOperator {
    /**
     * Створює екземпляр BroadcastOperator.
     *
     * @param {Object} adapter - Екземпляр адаптера (InMemoryAdapter або RedisAdapter).
     * @param {Set<string>} [rooms] - Початковий набір цільових кімнат.
     * @param {Set<string>} [except] - Початковий набір кімнат-виключень.
     * @param {BroadcastFlags} [flags] - Опціональні прапорці трансляції.
     */
    constructor(adapter, rooms = new Set(), except = new Set(), flags = {}) {
        /** @private */
        this._adapter = adapter
        /** @private */
        this._rooms = rooms
        /** @private */
        this._except = except
        /** @private */
        this._flags = flags
    }

    // --- МОДИФІКАТОРИ ФІЛЬТРІВ (КІМНАТИ) ---

    /**
     * Додає одну або кілька кімнат до списку отримувачів.
     * @param {string|string[]} room
     * @returns {BroadcastOperator}
     */
    to(room) {
        const rooms = new Set(this._rooms)
        if (Array.isArray(room)) {
            room.forEach((r) => rooms.add(r))
        } else {
            rooms.add(room)
        }
        return new BroadcastOperator(this._adapter, rooms, this._except, this._flags)
    }

    /** Синонім до `.to()` */
    in(room) {
        return this.to(room)
    }

    /**
     * Виключає одну або кілька кімнат з розсилки.
     * @param {string|string[]} room
     * @returns {BroadcastOperator}
     */
    except(room) {
        const except = new Set(this._except)
        if (Array.isArray(room)) {
            room.forEach((r) => except.add(r))
        } else {
            except.add(room)
        }
        return new BroadcastOperator(this._adapter, this._rooms, except, this._flags)
    }

    // --- ГЕТЕРИ ДЛЯ ПРАПОРЦІВ (FLAGS) ---

    /**
     * Включає режим "volatile". Повідомлення може бути втрачено, якщо у клієнта проблеми зі зв'язком.
     * Використання: `io.volatile.emit(...)`
     * @returns {BroadcastOperator}
     */
    get volatile() {
        const flags = { ...this._flags, volatile: true }
        return new BroadcastOperator(this._adapter, this._rooms, this._except, flags)
    }

    /**
     * Включає режим "local". Трансляція відбудеться лише для сокетів цього Node.js процесу.
     * Повідомлення НЕ буде опубліковано в Redis кластер.
     * Використання: `io.local.emit(...)`
     * @returns {BroadcastOperator}
     */
    get local() {
        const flags = { ...this._flags, local: true }
        return new BroadcastOperator(this._adapter, this._rooms, this._except, flags)
    }

    /**
     * Встановлює тайм-аут для очікування зворотного виклику (callback / acknowledgement) від клієнтів.
     * Використання: `io.timeout(5000).emit('request', data, (err, responses) => {})`
     *
     * @param {number} ms - Час очікування в мілісекундах.
     * @returns {BroadcastOperator}
     */
    timeout(ms) {
        const flags = { ...this._flags, timeout: ms }
        return new BroadcastOperator(this._adapter, this._rooms, this._except, flags)
    }

    // --- ГОЛОВНІ МЕТОДИ ДІЇ ---

    /**
     * Формує пакет події та передає його в адаптер разом із прапорцями та кімнатами.
     *
     * @param {string} event - Назва події.
     * @param {...any} args - Аргументи події (останнім може бути callback для відповідей).
     * @returns {void}
     */
    emit(event, ...args) {
        // Перевіряємо, чи передано callback функцію в кінці аргументів
        let hasCallback = typeof args[args.length - 1] === 'function'
        let callback = hasCallback ? args.pop() : null

        const packet = {
            type: 'event',
            data: [event, ...args],
        }

        // Формуємо повні опції для адаптера
        const opts = {
            rooms: this._rooms,
            except: this._except,
            flags: this._flags,
        }

        // Логіка обробки тайм-аутів та відповідей від клієнтів (якщо є callback)
        if (callback) {
            this._emitWithAck(packet, opts, callback)
        } else {
            this._adapter.broadcast(packet, opts)
        }
    }

    /**
     * Внутрішня логіка для збору відповідей (Acknowledgements) з підтримкою тайм-ауту.
     * @private
     */
    async _emitWithAck(packet, opts, callback) {
        const targetSockets = await this.fetchSockets()
        if (targetSockets.length === 0) {
            return callback(null, [])
        }

        let sidsCount = targetSockets.length
        const responses = []
        let called = false

        // Налаштовуємо тайм-аут, якщо прапорець встановлено через .timeout(ms)
        const timer = opts.flags.timeout
            ? setTimeout(() => {
                  if (called) return
                  called = true
                  const err = new Error('Operation timed out')
                  err.responses = responses
                  callback(err, responses)
              }, opts.flags.timeout)
            : null

        // Функція збору відповідей від кожного сокета
        const checkDone = (err, res) => {
            if (called) return
            if (res !== undefined) responses.push(res)
            sidsCount--

            if (sidsCount === 0) {
                if (timer) clearTimeout(timer)
                called = true
                callback(null, responses)
            }
        }

        // Емітимо подію кожному знайденому сокету індивідуально з його власним ack-ідентифікатором
        for (const socket of targetSockets) {
            if (typeof socket.emit === 'function') {
                socket.emit(packet.data[0], ...packet.data.slice(1), (res) => checkDone(null, res))
            } else {
                checkDone() // Якщо сокет серіалізований з іншої ноди Redis без методів
            }
        }
    }

    // --- МАСОВІ ОПЕРАЦІЇ НАД СОКЕТАМИ (ПЕРЕНЕСЕНІ З БАЗОВОГО КЛАСУ) ---

    /**
     * Повертає список сокетів, враховуючи прапорець `local`.
     * Якщо активовано `.local`, запит виконається синхронно суто на поточній ноді.
     *
     * @returns {Promise<Array<Object>>}
     */
    async fetchSockets() {
        const opts = { rooms: this._rooms, except: this._except }

        // Якщо включено флаг local, ми примусово використовуємо логіку InMemoryAdapter (ігноруючи Redis)
        if (
            this._flags.local &&
            typeof this._adapter.constructor.prototype.fetchSockets === 'function'
        ) {
            // Виклик методу InMemoryAdapter минаючи логіку Redis кластера
            return Object.getPrototypeOf(this._adapter.constructor.prototype).fetchSockets.call(
                this._adapter,
                opts,
            )
        }

        return this._adapter.fetchSockets(opts)
    }

    /**
     * Масово додає сокети, що відповідають фільтрам, до нових кімнат.
     * @param {string|string[]} rooms
     */
    async socketsJoin(rooms) {
        return this._adapter.socketsJoin(
            { rooms: this._rooms, except: this._except, flags: this._flags },
            rooms,
        )
    }

    /**
     * Масово видаляє сокети, що відповідають фільтрам, зі вказаних кімнат.
     * @param {string|string[]} rooms
     */
    async socketsLeave(rooms) {
        return this._adapter.socketsLeave(
            { rooms: this._rooms, except: this._except, flags: this._flags },
            rooms,
        )
    }

    /**
     * Масово відключає сокети, що відповідають фільтрам.
     * @param {boolean} [close=false]
     */
    async disconnectSockets(close = false) {
        return this._adapter.disconnectSockets(
            { rooms: this._rooms, except: this._except, flags: this._flags },
            close,
        )
    }
}
