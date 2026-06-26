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
     * Реєструє об'єкт сокета в системі адаптера.
     * @abstract
     * @param {any} socket - Об'єкт сокет-з'єднання.
     * @throws {Error} Якщо метод не реалізований у нащадку.
     */
    registerSocket(socket) {
        throw new Error("Method 'registerSocket' must be implemented.")
    }

    /**
     * Додає сокет до однієї кімнати за його ID.
     * @abstract
     * @param {string} socketId - Унікальний ідентифікатор сокета.
     * @param {string} roomName - Назва кімнати.
     */
    add(socketId, roomName) {
        throw new Error("Method 'add' must be implemented.")
    }

    /**
     * Додає сокет до кількох кімнат одночасно за його ID.
     * @abstract
     * @param {string} socketId - Унікальний ідентифікатор сокета.
     * @param {string[]} rooms - Масив назв кімнат.
     */
    addAll(socketId, rooms) {
        throw new Error("Method 'addAll' must be implemented.")
    }

    /**
     * Видаляє сокет із конкретної кімнати за його ID.
     * @abstract
     * @param {string} socketId - Унікальний ідентифікатор сокета.
     * @param {string} roomName - Назва кімнати.
     */
    del(socketId, roomName) {
        throw new Error("Method 'del' must be implemented.")
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
        throw new Error("Method 'delAll' must be implemented.")
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
        throw new Error("Method 'broadcast' must be implemented.")
    }

    /**
     * Отримує список усіх кімнат та ID сокетів у них.
     * @abstract
     * @async
     * @returns {Promise<Record<string, string[]>>} Проміс із об'єктом структур кімнат та масивів id.
     * @throws {Error} Якщо метод не реалізований у нащадку.
     */
    async fetchSockets() {
        throw new Error("Method 'fetchSockets' must be implemented.")
    }

    /**
     * Отримує повідомлення, які пропустив клієнт за час офлайну.
     * @abstract
     */
    getMissedMessages(roomName, lastMsgId) {
        throw new Error("Method 'getMissedMessages' must be implemented.")
    }
}
