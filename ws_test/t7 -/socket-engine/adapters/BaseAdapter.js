/**
 * @abstract
 * Базовий інтерфейс для управління кімнатами та маршрутизації повідомлень.
 * Нащадки повинні реалізувати синхронні або асинхронні методи залежно від сховища (пам'ять чи Redis).
 */
export class BaseAdapter {
    /**
     * @param {any} nsp - Екземпляр простору імен (Namespace), до якого прив'язаний адаптер.
     */
    constructor(nsp) {
        if (this.constructor === BaseAdapter) {
            throw new Error('[BaseAdapter] Cannot instantiate abstract class directly.')
        }

        /**
         * Посилання на простір імен для доступу до живих локальних сокетів.
         * @type {any}
         */
        this.nsp = nsp
    }

    /**
     * Допоміжний метод для генерації помилок абстракції.
     * @private
     */
    _throwAbstract(methodName) {
        throw new Error(`[BaseAdapter] Method '${methodName}' must be implemented by subclass.`)
    }

    // ==========================================
    // 1. УПРАВЛІННЯ КІМНАТАМИ (ROOM MANAGEMENT)
    // ==========================================

    /**
     * Додає сокет до конкретної кімнати.
     * @abstract
     * @param {string} socketId - ID сокета.
     * @param {string} roomName - Назва кімнати.
     * @returns {Promise<void>|void}
     */
    add(socketId, roomName) {
        this._throwAbstract('add')
    }

    /**
     * Додає сокет до кількох кімнат одночасно (оптимізований масовий метод).
     * @abstract
     * @param {string} socketId - ID сокета.
     * @param {string[]|Set<string>} rooms - Масив або множина назв кімнат.
     * @returns {Promise<void>|void}
     */
    addAll(socketId, rooms) {
        this._throwAbstract('addAll')
    }

    /**
     * Видаляє сокет із конкретної кімнати.
     * @abstract
     * @param {string} socketId - ID сокета.
     * @param {string} roomName - Назва кімнати.
     * @returns {Promise<void>|void}
     */
    del(socketId, roomName) {
        this._throwAbstract('del')
    }

    /**
     * Повністю видаляє сокет з усіх кімнат (викликається при остаточному відключенні).
     * @abstract
     * @param {string} socketId - ID сокета.
     * @returns {Promise<void>|void}
     */
    delAll(socketId) {
        this._throwAbstract('delAll')
    }

    // ==========================================
    // 2. ІНФОРМАЦІЯ ПРО СТАН (INTROSPECTION)
    // ==========================================

    /**
     * Повертає список кімнат, у яких зараз перебуває конкретний сокет.
     * @abstract
     * @param {string} socketId - ID сокета.
     * @returns {Promise<Set<string>>|Set<string>} Множина назв кімнат.
     */
    getRoomsBySocket(socketId) {
        this._throwAbstract('getRoomsBySocket')
    }

    /**
     * Повертає список активних об'єктів сокетів (або їх проксі) з можливістю фільтрації.
     * @abstract
     * @param {object} [opts] - Параметри фільтрації.
     * @param {string} [opts.room] - Фільтр по конкретній кімнаті.
     * @returns {Promise<any[]>} Масив об'єктів сокетів.
     */
    async fetchSockets(opts = {}) {
        this._throwAbstract('fetchSockets')
    }

    // ==========================================
    // 3. МАРШРУТИЗАЦІЯ ПОВІДОМЛЕНЬ (BROADCASTING)
    // ==========================================

    /**
     * Транслює пакет даних цільовим кімнатам з урахуванням винятків та прапорців.
     * @abstract
     * @param {any} packet - Об'єкт повідомлення (назва події, payload тощо).
     * @param {object} opts - Опції маршрутизації.
     * @param {Set<string>} opts.rooms - Набір кімнат-одержувачів (якщо порожній — шлемо всім у namespace).
     * @param {Set<string>} opts.except - Набір кімнат-винятків (кого ігнорувати).
     * @param {object} [opts.flags] - Додаткові системні прапорці (напр. volatile, local).
     * @returns {Promise<void>|void}
     */
    broadcast(packet, opts) {
        this._throwAbstract('broadcast')
    }
}
