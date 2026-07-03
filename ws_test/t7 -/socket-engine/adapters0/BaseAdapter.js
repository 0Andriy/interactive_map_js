/**
 * Інтерфейс
 * Абстрактний базовий клас для адаптерів керування WebSocket-сесіями та кімнатами.
 * @abstract
 */
export class BaseAdapter {
    /**
     * Створює екземпляр адаптера для конкретного простору імен.
     * @param {string} nspName - Унікальне ім'я простору імен (namespace).
     */
    constructor(nspName) {
        /** @type {string} */
        this.nspName = nspName

        /** @type {any|null} Екземпляр простору імен */
        this.nsp = null
    }

    /**
     * Встановлює активний екземпляр простору імен для адаптера.
     * @param {any} nspInstance - Об'єкт простору імен.
     */
    setNamespace(nspInstance) {
        this.nsp = nspInstance
    }

    /**
     * Допоміжний метод для імітації абстрактних методів.
     * @private
     * @param {string} methodName - Назва методу.
     */
    _throwAbstract(methodName) {
        throw new Error(`[BaseAdapter] Method '${methodName}' must be implemented.`)
    }

    /**
     * Реєструє об'єкт сокета в системі адаптера.
     * @abstract
     * @param {any} socket - Об'єкт сокет-з'єднання.
     * @throws {Error} Якщо метод не реалізований у нащадку.
     */
    registerSocket(socket) {
        throw new Error("[BaseAdapter] Method 'registerSocket' must be implemented.")
    }

    /**
     * Додає сокет до однієї кімнати за його ID.
     * @abstract
     * @param {string} socketId - Унікальний ідентифікатор сокета.
     * @param {string} roomName - Назва кімнати.
     */
    add(socketId, roomName) {
        throw new Error("[BaseAdapter] Method 'add' must be implemented.")
    }

    /**
     * Додає сокет до кількох кімнат одночасно за його ID.
     * @abstract
     * @param {string} socketId - Унікальний ідентифікатор сокета.
     * @param {string[]} rooms - Масив назв кімнат.
     */
    addAll(socketId, rooms) {
        throw new Error("[BaseAdapter] Method 'addAll' must be implemented.")
    }

    /**
     * Видаляє сокет із конкретної кімнати за його ID.
     * @abstract
     * @param {string} socketId - Унікальний ідентифікатор сокета.
     * @param {string} roomName - Назва кімнати.
     */
    del(socketId, roomName) {
        throw new Error("[BaseAdapter] Method 'del' must be implemented.")
    }

    /**
     * Видаляє сокет з усіх кімнат (зазвичай при відключенні).
     * @abstract
     * @param {string} socketId - Унікальний ідентифікатор сокета.
     * @param {number} graceMs - Час відстрочки у мілісекундах перед очищенням.
     * @param {Function} onFinalCleanup - Коллбек-функція, що викликається після очищення.
     * @throws {Error} Якщо метод не реалізований у нащадку.
     */
    delAll(socketId, graceMs, onFinalCleanup) {
        throw new Error("[BaseAdapter] Method 'delAll' must be implemented.")
    }

    /**
     * Транслює (надсилає) пакет даних усім сокетам у кімнаті або глобально.
     * @abstract
     * @param {string|null} roomName - Назва кімнати для розсилки (або null для розсилки усім).
     * @param {any} packet - Дані, які потрібно надіслати.
     * @param {object} [opts] - Додаткові опції (виключення сокетів, volatile тощо).
     * @throws {Error} Якщо метод не реалізований у нащадку.
     */
    broadcast(roomName, packet, opts) {
        throw new Error("[BaseAdapter] Method 'broadcast' must be implemented.")
    }

    /**
     * Повертає список активних об'єктів сокетів з можливістю фільтрації по кімнаті.
     * @abstract
     * @async
     * @param {string|null} [roomName=null] - Назва кімнати для фільтрації, або null для всіх сокетів системи.
     * @returns {Promise<any[]>} Проміс із масивом активних об'єктів сокетів (або їх проксі/RemoteSocket).
     * @throws {Error} Якщо метод не реалізований у нащадку.
     */
    async fetchSockets(roomName = null) {
        throw new Error("[BaseAdapter] Method 'fetchSockets' must be implemented.")
    }

    /**
     * Отримує повідомлення, які пропустив клієнт за час офлайну.
     * @abstract
     * @param {string} roomName - Назва кімнати.
     * @param {string|number} lastMsgId - ID останнього отриманого повідомлення.
     */
    getMissedMessages(roomName, lastMsgId) {
        this._throwAbstract('getMissedMessages')
    }
}
