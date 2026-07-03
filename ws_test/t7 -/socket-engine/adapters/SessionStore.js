import { v7 as uuidv7 } from 'uuid'
import crypto from 'crypto'

/**
 * Клас для збереження зліпку сесії користувача перед офлайном.
 */
export class SessionSnapshot {
    /**
     * @param {string} sessionId - Унікальний довговічний ID сесії.
     * @param {Set<string>} rooms - Кімнати, де перебував користувач.
     */
    constructor(sessionId, rooms) {
        this.sessionId = sessionId
        this.rooms = rooms
        this.disconnectedAt = Date.now()
    }
}

/**
 * Сховище сесій та черг повідомлень для відновлення зв'язку (Connection State Recovery).
 */
export class InMemorySessionStore {
    /**
     * @param {number} [maxBufferSize=100] - Максимальний розмір черги повідомлень у кімнаті.
     */
    constructor(maxBufferSize = 100) {
        /** @type {Map<string, SessionSnapshot>} SessionId -> SessionSnapshot */
        this.sessions = new Map()

        /** @type {Map<string, Array<{packet: any, id: string}>>} RoomName -> Масив повідомлень */
        this.roomBuffers = new Map()

        this.maxBufferSize = maxBufferSize
    }

    /**
     * Генерує унікальний ідентифікатор повідомлення (UUIDv7).
     * @param {any} packet - Об'єкт повідомлення.
     * @returns {string}
     */
    ensureMessageId(packet) {
        if (typeof packet !== 'object' || packet === null) {
            return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
        }
        if (!packet.meta) packet.meta = {}
        if (!packet.meta.id) {
            packet.meta.id = uuidv7 ? uuidv7() : crypto.randomUUID()
        }
        return packet.meta.id
    }

    /**
     * Додає повідомлення в буфер конкретної кімнати.
     * @param {string} roomName - Назва кімнати.
     * @param {any} packet - Пакет даних.
     * @returns {string} ID згенерованого повідомлення.
     */
    addMessage(roomName, packet) {
        const msgId = this.ensureMessageId(packet)
        let buffer = this.roomBuffers.get(roomName)

        if (!buffer) {
            buffer = []
            this.roomBuffers.set(roomName, buffer)
        }

        buffer.push({ packet, id: msgId })

        if (buffer.length > this.maxBufferSize) {
            buffer.shift()
        }
        return msgId
    }

    /**
     * Зберігає зліпок сесії користувача при відключенні.
     * @param {string} sessionId - ID сесії.
     * @param {Set<string>} rooms - Поточні кімнати сокета.
     */
    saveSession(sessionId, rooms) {
        this.sessions.set(sessionId, new SessionSnapshot(sessionId, rooms))
    }

    /**
     * Знаходить збережену сесію для відновлення.
     * @param {string} sessionId - ID сесії.
     * @returns {SessionSnapshot|null}
     */
    findSession(sessionId) {
        return this.sessions.get(sessionId) || null
    }

    /**
     * Видаляє сесію після успішного відновлення або за таймаутом.
     * @param {string} sessionId - ID сесії.
     */
    deleteSession(sessionId) {
        this.sessions.delete(sessionId)
    }

    /**
     * Отримує список повідомлень, які пропустив клієнт.
     * @param {string} roomName - Назва кімнати.
     * @param {string} lastMsgId - ID останнього відомого клієнту повідомлення.
     * @returns {any[]} Масив пакетів.
     */
    getMissedMessages(roomName, lastMsgId) {
        const buffer = this.roomBuffers.get(roomName)
        if (!buffer) return []

        const index = buffer.findIndex((msg) => msg.id === lastMsgId)
        // Якщо ID не знайдено (застаріло і видалено з буфера), повертаємо весь буфер
        if (index === -1) return buffer.map((msg) => msg.packet)

        // Повертаємо лише те, що було створено ПІСЛЯ відомого клієнту ID
        return buffer.slice(index + 1).map((msg) => msg.packet)
    }

    /**
     * Очищає старі буфери порожніх кімнат.
     * @param {string} roomName - Назва кімнати.
     */
    clearRoomBuffer(roomName) {
        this.roomBuffers.delete(roomName)
    }
}
