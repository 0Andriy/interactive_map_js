/**
 * Клас-оператор для побудови ланцюжків умов трансляції (наприклад, io.to().except().emit()).
 * Накопичує фільтри кімнат та передає фінальний пакет в адаптер простору імен.
 */
export class BroadcastOperator {
    /**
     * Створює екземпляр BroadcastOperator.
     *
     * @param {Object} adapter - Екземпляр адаптера (InMemoryAdapter або RedisAdapter).
     * @param {Set<string>} [rooms] - Початковий набір цільових кімнат.
     * @param {Set<string>} [except] - Початковий набір кімнат-виключень.
     */
    constructor(adapter, rooms = new Set(), except = new Set()) {
        /**
         * Посилання на адаптер для фінальної розсилки.
         * @type {Object}
         * @private
         */
        this._adapter = adapter

        /**
         * Набір кімнат, в які буде надіслано повідомлення.
         * @type {Set<string>}
         * @private
         */
        this._rooms = rooms

        /**
         * Набір кімнат або сокетів, які будуть виключені з розсилки.
         * @type {Set<string>}
         * @private
         */
        this._except = except
    }

    /**
     * Додає одну або кілька кімнат до списку отримувачів трансляції.
     * Дозволяє будувати ланцюжок: operator.to('room1').to('room2')
     *
     * @param {string|string[]} room - Назва кімнати або масив назв кімнат.
     * @returns {BroadcastOperator} Повертає цей же екземпляр оператора для ланцюжка.
     */
    to(room) {
        const rooms = new Set(this._rooms)
        if (Array.isArray(room)) {
            room.forEach((r) => rooms.add(r))
        } else {
            rooms.add(room)
        }
        // Повертаємо новий оператор (як в Socket.IO) або поточний, зберігаючи імутабельність за бажанням.
        // Для простоти повертаємо новий екземпляр із новими наборами фільтрів:
        return new BroadcastOperator(this._adapter, rooms, this._except)
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
     * Додає одну або кілька кімнат до списку виключень (except).
     * Клієнти в цих кімнатах не отримають повідомлення, навіть якщо вони є в цільових кімнатах.
     *
     * @param {string|string[]} room - Назва кімнати/ID сокета або масив для виключення.
     * @returns {BroadcastOperator} Повертає новий екземпляр оператора з оновленими виключеннями.
     */
    except(room) {
        const except = new Set(this._except)
        if (Array.isArray(room)) {
            room.forEach((r) => except.add(r))
        } else {
            except.add(room)
        }
        return new BroadcastOperator(this._adapter, this._rooms, except)
    }

    /**
     * Головний метод трансляції події. Формує пакет і викликає `broadcast` в адаптері.
     *
     * @param {string} event - Назва події (наприклад, 'chat-message').
     * @param {...any} args - Аргументи події, які передаються клієнту.
     * @returns {void}
     */
    emit(event, ...args) {
        // Формуємо сирий пакет даних, який розумітиме клієнт та адаптер
        const packet = {
            type: 'event', // або за вашим протоколом
            data: [event, ...args],
        }

        // Передаємо пакет та накопичені фільтри в наш адаптер
        this._adapter.broadcast(packet, {
            rooms: this._rooms,
            except: this._except,
        })
    }

    /**
     * Повертає список об'єктів сокетів, які відповідають поточним фільтрам оператора.
     * Завдяки цьому можна писати: `await io.to('room1').fetchSockets()`
     *
     * @returns {Promise<Array<Object>>} Масив об'єктів сокетів у пам'яті (або серіалізованих з кластера).
     */
    async fetchSockets() {
        return this._adapter.fetchSockets({
            rooms: this._rooms,
            except: this._except,
        })
    }

    /**
     * Масово додає всі сокети, що відповідають фільтрам, до нових кімнат.
     * Приклад: `io.to('room1').socketsJoin('room2')`
     *
     * @param {string|string[]} rooms - Кімнати, в які потрібно додати сокети.
     * @returns {Promise<void>}
     */
    async socketsJoin(rooms) {
        return this._adapter.socketsJoin(
            {
                rooms: this._rooms,
                except: this._except,
            },
            rooms,
        )
    }

    /**
     * Масово видаляє всі сокети, що відповідають фільтрам, зі вказаних кімнат.
     *
     * @param {string|string[]} rooms - Кімнати, з яких потрібно видалити сокети.
     * @returns {Promise<void>}
     */
    async socketsLeave(rooms) {
        return this._adapter.socketsLeave(
            {
                rooms: this._rooms,
                except: this._except,
            },
            rooms,
        )
    }

    /**
     * Примусово відключає всі сокети, що відповідають фільтрам оператора.
     *
     * @param {boolean} [close=false] - Чи жорстко закривати TCP-з'єднання.
     * @returns {Promise<void>}
     */
    async disconnectSockets(close = false) {
        return this._adapter.disconnectSockets(
            {
                rooms: this._rooms,
                except: this._except,
            },
            close,
        )
    }
}
