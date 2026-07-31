/**
 * Базовий клас для всіх адаптерів керування кімнатами та сокетами.
 * Визначає загальний інтерфейс та структуру даних, яку мають реалізовувати
 * конкретні адаптери (наприклад, InMemoryAdapter, RedisAdapter тощо).
 */
export class BaseAdapter {
    /**
     * Створює екземпляр BaseAdapter.
     * @param {Object} namespace - Простір імен (Namespace), до якого прив'язаний адаптер.
     * @param {Map<string, Object>} namespace.sockets - Карта всіх активних сокетів у цьому просторі імен.
     */
    constructor(namespace) {
        /**
         * Посилання на простір імен сервера.
         * @type {Object}
         */
        this.nsp = namespace

        /**
         * Карта кімнат (має бути перевизначена в дочірньому класі).
         * @type {Map<string, Set<string>>}
         */
        this.rooms = new Map()

        /**
         * Карта сокетів та їхніх кімнат (має бути перевизначена в дочірньому класі).
         * @type {Map<string, Set<string>>}
         */
        this.sids = new Map()
    }

    /**
     * Додає сокет до конкретної кімнати.
     * @abstract
     * @param {string} socketId - Унікальний ідентифікатор сокета.
     * @param {string} roomName - Назва кімнати.
     */
    add(socketId, roomName) {
        throw new Error("Метод 'add()' має бути реалізований у дочірньому класі")
    }

    /**
     * Додає сокет до кількох кімнат одночасно.
     * @abstract
     * @param {string} socketId - Унікальний ідентифікатор сокета.
     * @param {string|string[]|Set<string>} rooms - Одна кімната, масив або Set кімнат.
     */
    addAll(socketId, rooms) {
        throw new Error("Метод 'addAll()' має бути реалізований у дочірньому класі")
    }

    /**
     * Видаляє сокет з конкретної кімнати.
     * @abstract
     * @param {string} socketId - Унікальний ідентифікатор сокета.
     * @param {string} roomName - Назва кімнати.
     */
    del(socketId, roomName) {
        throw new Error("Метод 'del()' має бути реалізований у дочірньому класі")
    }

    /**
     * Повністю видаляє сокет з усіх кімнат.
     * @abstract
     * @param {string} socketId - Унікальний ідентифікатор сокета.
     */
    delAll(socketId) {
        throw new Error("Метод 'delAll()' має бути реалізований у дочірньому класі")
    }

    /**
     * Транслює сирий пакет даних усім цільовим сокетам відповідно до фільтрів.
     * @abstract
     * @param {any} packet - Об'єкт або дані пакета для надсилання.
     * @param {Object} [opts={}] - Параметри трансляції (rooms, except).
     */
    broadcast(packet, opts = {}) {
        throw new Error("Метод 'broadcast()' має бути реалізований у дочірньому класі")
    }

    /**
     * Повертає список реальних об'єктів сокетів, що відповідають критеріям фільтрації.
     * @abstract
     * @param {Object} [opts={}] - Параметри фільтрації сокетів.
     * @returns {Promise<Array<Object>>}
     */
    async fetchSockets(opts = {}) {
        throw new Error("Метод 'fetchSockets()' має бути реалізований у дочірньому класі")
    }
}
