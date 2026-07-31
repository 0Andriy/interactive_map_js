import crypto from 'node:crypto'

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
        // ЗАХИСТ: Перевіряємо наявність адаптера та базових методів
        if (!adapter || typeof adapter.broadcast !== 'function') {
            throw new TypeError('BroadcastOperator: adapter must implement a broadcast method')
        }

        /**
         * Посилання на адаптер для фінальної розсилки.
         * @type {Object}
         * @private
         */
        this._adapter = adapter

        /**
         * Набір кімнат, в які буде надіслано повідомлення.
         * ЗАХИСТ: Гарантуємо, що rooms завжди буде Set, навіть якщо передали null або інший тип
         * @type {Set<string>}
         * @private
         */
        this._rooms =
            rooms instanceof Set
                ? rooms
                : new Set(Array.isArray(rooms) ? rooms : [rooms].filter(Boolean))

        /**
         * Набір кімнат або сокетів, які будуть виключені з розсилки.
         * ЗАХИСТ: Гарантуємо, що except завжди буде Set, навіть якщо передали null або інший тип
         * @type {Set<string>}
         * @private
         */
        this._except =
            except instanceof Set
                ? except
                : new Set(Array.isArray(except) ? except : [except].filter(Boolean))

        /**
         * Додаткові прапорці та параметри конфігурації розсилки.
         * ЗАХИСТ: Гарантуємо, що flags — це об'єкт
         * @type {Object}
         * @private
         */
        this._flags = flags && typeof flags === 'object' ? flags : {}
    }

    // --- МОДИФІКАТОРИ ФІЛЬТРІВ (КІМНАТИ) ---

    /**
     * Додає одну або кілька кімнат до списку отримувачів трансляції.
     * Дозволяє будувати ланцюжок: operator.to('room1').to('room2')
     *
     * @param {string|string[]} room - Назва кімнати або масив назв кімнат.
     * @returns {BroadcastOperator} Повертає цей же екземпляр оператора для ланцюжка.
     */
    to(room) {
        // ЗАХИСТ: Якщо передано порожнє значення, повертаємо копію оператора без змін
        if (!room) return this

        const rooms = new Set(this._rooms)
        if (Array.isArray(room)) {
            room.forEach((r) => r && rooms.add(String(r)))
        } else {
            rooms.add(String(room))
        }

        // Повертаємо новий оператор або поточний, зберігаючи імутабельність за бажанням.
        // Для простоти повертаємо новий екземпляр із новими наборами фільтрів:
        return new BroadcastOperator(this._adapter, rooms, this._except, this._flags)
    }

    /**
     * Синонім до методу `to`. Додає кімнату до списку отримувачів.
     *
     * @param {string|string[]} room - Назва кімнати або масив назв кімнат.
     * @returns {BroadcastOperator}
     */
    in(room) {
        return this.to(room)
    }

    /**
     * Виключає конкретні кімнати або ID сокетів із цієї розсилки.
     * Додає одну або кілька кімнат до списку виключень (except).
     * Клієнти в цих кімнатах не отримають повідомлення, навіть якщо вони є в цільових кімнатах.
     *
     * @param {string|string[]} roomOrSocketId  - Назва кімнати/ID сокета або масив для виключення.
     * @returns {BroadcastOperator} Повертає новий екземпляр оператора з оновленими виключеннями.
     */
    except(roomOrSocketId) {
        if (!roomOrSocketId) return this

        const except = new Set(this._except)
        if (Array.isArray(roomOrSocketId)) {
            // Приводимо кожен ID до рядка (і для кімнат, і для socket.id)
            roomOrSocketId.forEach((id) => id && except.add(String(id)))
        } else {
            except.add(String(roomOrSocketId))
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
        // ЗАХИСТ: Валідація числа тайм-ауту
        const timeoutMs = parseInt(ms, 10)
        if (isNaN(timeoutMs) || timeoutMs <= 0) return this

        const flags = { ...this._flags, timeout: timeoutMs }
        return new BroadcastOperator(this._adapter, this._rooms, this._except, flags)
    }

    // --- ГОЛОВНІ МЕТОДИ ДІЇ ---

    /**
     * Формує пакет події та передає його в адаптер разом із прапорцями та кімнатами.
     *
     * @param {string} event - Назва події (наприклад, 'chat-message').
     * @param {...any} args - Аргументи події (останнім може бути callback для відповідей).
     * @returns {void}
     */
    emit(event, ...args) {
        // ЗАХИСТ: Назва події має бути рядком і не бути порожньою
        if (typeof event !== 'string' || !event.trim()) {
            throw new TypeError('BroadcastOperator.emit: event name must be a non-empty string')
        }

        // Перевіряємо, чи передано callback функцію в кінці аргументів
        let hasCallback = typeof args[args.length - 1] === 'function'
        let callback = hasCallback ? args.pop() : null

        // Формуємо data. Якщо аргументів кілька — загортаємо в масив.
        // Якщо один — передаємо чистий об'єкт/значення. Якщо немає — null.
        let payload = null
        if (args.length === 1) {
            payload = args[0]
        } else if (args.length > 1) {
            payload = args
        }

        // Генерація інфраструктурних метаданих пакета
        const meta = {
            // Унікальний маркер для дедуплікації та трекінгу
            id:
                typeof crypto !== 'undefined'
                    ? crypto.randomUUID()
                    : Math.random().toString(36).substring(2, 11),
            // Точний час створення повідомлення на сервері
            timestamp: Date.now(),
            // Сюди можна підмішати кастомні прапорці з оператора, якщо адаптеру потрібні метадані
            ...(this._flags.traceId ? { traceId: this._flags.traceId } : {}),
        }

        const packet = {
            type: 'event',
            event: event,
            data: payload,
            meta: meta,
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
        // ЗАХИСТ: Перевіряємо, чи fetchSockets існує в адаптері
        if (typeof this.adapter.fetchSockets !== 'function') {
            return callback(
                new Error('Adapter does not support fetchSockets for acknowledgements'),
                [],
            )
        }

        try {
            const targetSockets = await this.fetchSockets()
            if (!Array.isArray(targetSockets) || targetSockets.length === 0) {
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

            for (const socket of targetSockets) {
                if (socket && typeof socket.emit === 'function') {
                    // Для локальних сокетів викликаємо їхній emit: назва події, дані події, колбек
                    socket.emit(packet.event, packet.data, packet.meta, (res) =>
                        checkDone(null, res),
                    )
                } else {
                    checkDone()
                }
            }
        } catch (error) {
            callback(error, [])
        }
    }

    // --- МАСОВІ ОПЕРАЦІЇ НАД СОКЕТАМИ (ПЕРЕНЕСЕНІ З БАЗОВОГО КЛАСУ) ---

    /**
     * Повертає список сокетів, які відповідають поточним фільтрам оператора.
     * Якщо активовано `.local`, запит виконається синхронно суто на поточній ноді.
     * Завдяки цьому можна писати: `await io.to('room1').fetchSockets()`
     *
     * @returns {Promise<Array<Object>>}
     */
    async fetchSockets() {
        const opts = { rooms: this._rooms, except: this._except }

        // Якщо включено флаг local, ми примусово використовуємо логіку InMemoryAdapter (ігноруючи Redis)
        if (this.flags.local && this.adapter.constructor) {
            try {
                const proto = Object.getPrototypeOf(this.adapter.constructor.prototype)
                if (proto && typeof proto.fetchSockets === 'function') {
                    // Виклик методу InMemoryAdapter минаючи логіку Redis кластера
                    return proto.fetchSockets.call(this.adapter, opts)
                }
            } catch (err) {
                // Фолбек на стандартний виклик, якщо маніпуляції з прототипом впали
                return this._adapter.fetchSockets(opts)
            }
        }

        return this._adapter.fetchSockets(opts)
    }

    // ---------------------------------

    // Допоміжний приватний метод для нормалізації масиву кімнат
    _parseTargetRooms(rooms) {
        if (!rooms) return []
        const targets = Array.isArray(rooms) ? rooms : [rooms]
        return targets.map((r) => String(r)).filter(Boolean)
    }

    /**
     * Масово додає сокети, що відповідають фільтрам, до нових кімнат.
     * @param {string|string[]} rooms
     */
    async socketsJoin(rooms) {
        // ЗАХИСТ методів адаптера: Перевіряємо наявність функцій перед викликом
        if (typeof this.adapter.socketsJoin !== 'function') return

        const validatedRooms = this._parseTargetRooms(rooms)
        if (validatedRooms.length === 0) return // Нічого робити, якщо масив порожній

        return this._adapter.socketsJoin(
            { rooms: this._rooms, except: this._except, flags: this._flags },
            validatedRooms,
        )
    }

    /**
     * Масово видаляє сокети, що відповідають фільтрам, зі вказаних кімнат.
     * @param {string|string[]} rooms
     */
    async socketsLeave(rooms) {
        if (typeof this.adapter.socketsLeave !== 'function') return

        const validatedRooms = this._parseTargetRooms(rooms)
        if (validatedRooms.length === 0) return // Нічого робити, якщо масив порожній

        return this._adapter.socketsLeave(
            { rooms: this._rooms, except: this._except, flags: this._flags },
            validatedRooms,
        )
    }

    /**
     * Масово відключає сокети, що відповідають фільтрам.
     * @param {boolean} [close=false]
     */
    async disconnectSockets(close = false) {
        if (typeof this.adapter.disconnectSockets !== 'function') return

        return this._adapter.disconnectSockets(
            { rooms: this._rooms, except: this._except, flags: this._flags },
            !!close, // Примусове приведення до Boolean
        )
    }
}
