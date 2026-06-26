/**
 * Клас-оператор (Builder), що дозволяє гнучко конструювати параметри розсилки повідомлень
 * за допомогою ланцюжка методів (method chaining).
 */
export class BroadcastOperator {
    /**
     * Створює екземпляр BroadcastOperator.
     * @param {import('./BaseAdapter.js').BaseAdapter} adapter - Екземпляр адаптера (Memory або Redis).
     * @param {string|null} [exceptSocketId=null] - ID сокета, який потрібно виключити з розсилки.
     */
    constructor(adapter, exceptSocketId = null) {
        /** @type {import('./BaseAdapter.js').BaseAdapter} */
        this.adapter = adapter
        /** @type {string|null} */
        this.exceptSocketId = exceptSocketId
        /** @type {Set<string>} Список цільових кімнат для розсилки */
        this.rooms = new Set()
        /** @type {boolean} Чи є повідомлення некритичним до втрати (пропуск при повному буфері) */
        this.isVolatile = false
        /** @type {number|null} Таймаут очікування підтвердження (ACK) у мілісекундах */
        this.ackTimeoutMs = null
    }

    /**
     * Додає кімнату до списку отримувачів розсилки.
     * @param {string} roomName - Назва кімнати.
     * @returns {this} Повертає цей же екземпляр оператора для ланцюжка.
     */
    to(roomName) {
        if (typeof roomName === 'string' && roomName.trim() !== '') {
            this.rooms.add(roomName)
        }
        return this
    }

    /**
     * Аліас для методу .to(). Додає кімнату до списку отримувачів.
     * @param {string} roomName - Назва кімнати.
     * @returns {this}
     */
    in(roomName) {
        return this.to(roomName)
    }

    /**
     * Геттер, який перемикає розсилку в режим volatile (пропускати клієнтів із забитим буфером мережі).
     * @returns {this}
     */
    get volatile() {
        this.isVolatile = true
        return this
    }

    /**
     * Встановлює таймаут для очікування відповіді (ACK) від клієнта.
     * @param {number} ms - Час у мілісекундах.
     * @returns {this}
     */
    timeout(ms) {
        const parsedMs = Number(ms)
        if (!isNaN(parsedMs) && parsedMs > 0) {
            this.ackTimeoutMs = parsedMs
        }
        return this
    }

    /**
     * Формує пакет і запускає фінальну розсилку через адаптер.
     * @param {string} event - Назва події (наприклад, 'message').
     * @param {any} data - Дані події.
     */
    emit(event, data) {
        if (typeof event !== 'string') return

        // ПАКЕТ ІЗ ЗАЛІЗОБЕТОННИМ КОНВЕРТОМ МЕТАДАНИХ ДЛЯ ВСІХ РОЗСИЛОК
        const packet = {
            event,
            data,
            meta: {
                id: `msg_${Math.random().toString(36).substring(2, 11)}`, // Глобальний ID повідомлення
                timestamp: Date.now(), // Точний Unix-час сервера
                serverTime: new Date().toISOString(), // ISO рядок часу
                nsp: this.adapter.nspName, // АВТОМАТИЧНО ДОДАЄМО НАЗВУ NAMESPACE (наприклад, '/chat')
                rooms: this.rooms.size > 0 ? Array.from(this.rooms) : null, // Список цільових кімнат розсилки
            },
        }

        const opts = {
            except: this.exceptSocketId,
            volatile: this.isVolatile,
            timeoutMs: this.ackTimeoutMs,
        }

        // Сценарій 1: Якщо кімнати не вказані, робимо глобальну розсилку усім в межах namespace
        if (this.rooms.size === 0) {
            this.adapter.broadcast(null, packet, opts)
            return
        }

        // Сценарій 2: Передаємо весь Set/Масив кімнат в адаптер, щоб уникнути дублювання повідомлень у клієнтів
        // Для зворотної сумісності перетворюємо Set у масив рядків
        const targetRooms = Array.from(this.rooms)
        this.adapter.broadcast(targetRooms, packet, opts)
    }
}
