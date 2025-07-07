import WebSocket from 'ws'

/**
 * Представляє одного підключеного клієнта (з'єднання).
 * Інкапсолює екземпляр WebSocet та пов'язані з ним дані.
 */
export class Client {
    /**
     * Унікальний ідентифікатор з'єднання.
     * @type {string}
     * @readonly
     */
    id

    /**
     * Ідентифікатор користувача.
     * @type {string|undefined}
     * @readonly
     */
    userId

    /**
     * Ім'я користувача.
     * @type {string|undefined}
     * @readonly
     */
    username

    /**
     * Оригінальний екземпляр WebSocket.
     * @type {WebSocet}
     * @readonly
     */
    ws

    /**
     * Набір імен кімнат, до яких приєднався цей клієнт.
     * @type {Set<string>}
     * @readonly
     */
    rooms = new Set()

    /**
     * @param {WebSocet} ws Екземпляр WebSocket.
     * @param {string} id Унікальний ID для цього з'єднання.
     * @param {object} [options={}] Додаткові опції.
     * @param {string} [options.userId] ID користувача.
     * @param {string} [options.username] Ім'я користувача.
     */
    constructor(ws, id, { userId, username } = {}) {
        this.ws = ws
        this.id = id
        this.userId = userId
        this.username = username
        this.rooms = new Set()
    }

    /**
     * Повертає рядок для логування, що ідентифікує клієнта.
     * @returns {string}
     */
    getIdentifier() {
        const userIdPart = this.userId ? ` (UserID: ${this.userId})` : ''
        const usernamePart = this.username ? ` (Username: ${this.username})` : ''
        return `Connection ID: ${this.id}${userIdPart}${usernamePart}`
    }

    /**
     * Надсилає дані цьому клієнту. Прямо передає аргументи до `ws.send`
     * @param {*} data Дані для надсилання (string, Buffer, ArrayBuffer, etc.)
     * @param {object} [options] Опції для `ws.send`, напр. `{ binary: true }`.
     * @returns {boolean} Повертає `true` в разі успіху.
     */
    send(data, options) {
        if (this.ws.readyState !== WebSocket.OPEN) {
            return false
        }

        try {
            this.ws.send(data, options)
        } catch (error) {
            return false
        }
    }

    /**
     * Додає кімнату до списку кімнат клієнта.
     * @param {string} roomName Назва кімнати.
     * @package
     */
    joinRoom(roomName) {
        this.rooms.add(roomName)
    }

    /**
     * Видаляє кімнату зі списку кімнат клієнта.
     * @param {string} roomName Назва кімнати.
     * @package
     */
    leaveRoom(roomName) {
        this.rooms.delete(roomName)
    }
}
