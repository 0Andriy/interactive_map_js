import { StateAdapter } from '../../interfaces/StateAdapter.js'

/**
 * @file Реалізація In-memory адаптера стану.
 * @module adapters/state/MemoryStateAdapter
 */

/**
 * Адаптер для зберігання стану в оперативній пам'яті поточного процесу.
 * Використовується для розробки або односерверних конфігурацій.
 *
 * @class MemoryStateAdapter
 * @extends StateAdapter
 */
export class MemoryStateAdapter extends StateAdapter {
    /**
     * @param {Object} logger - Екземпляр логера.
     */
    constructor(logger) {
        super()
        /**
         * Ключ: "ns:room", Значення: Set із socketId
         * @type {Map<string, Set<string>>}
         * @private
         */
        this._rooms = new Map()
        this.logger = logger.child ? logger.child({ service: 'MemoryState' }) : logger
    }

    /**
     * Додає сокет до кімнати.
     * @param {string} ns - Простір імен.
     * @param {string} room - Назва кімнати.
     * @param {string} socketId - ID сокета.
     * @returns {Promise<void>}
     */
    async addUserToRoom(ns, room, socketId) {
        const key = this._buildKey(ns, room)
        if (!this._rooms.has(key)) {
            this._rooms.set(key, new Set())
        }
        this._rooms.get(key).add(socketId)
    }

    /**
     * Видаляє сокет з кімнати. Очищує Map, якщо кімната порожня.
     * @param {string} ns
     * @param {string} room
     * @param {string} socketId
     * @returns {Promise<void>}
     */
    async removeUserFromRoom(ns, room, socketId) {
        const key = this._buildKey(ns, room)
        const set = this._rooms.get(key)

        if (set) {
            set.delete(socketId)
            // Важливо: очищення пам'яті
            if (set.size === 0) {
                this._rooms.delete(key)
            }
        }
    }

    /**
     * Повертає список всіх ID сокетів у кімнаті.
     * @param {string} ns
     * @param {string} room
     * @returns {Promise<string[]>}
     */
    async getUsersInRoom(ns, room) {
        const key = this._buildKey(ns, room)
        const set = this._rooms.get(key)
        return set ? Array.from(set) : []
    }

    /**
     * Перевіряє наявність сокета в кімнаті.
     * @param {string} ns
     * @param {string} room
     * @param {string} socketId
     * @returns {Promise<boolean>}
     */
    async isUserInRoom(ns, room, socketId) {
        const key = this._buildKey(ns, room)
        return this._rooms.get(key)?.has(socketId) || false
    }

    /**
     * Рахує кількість підключень у кімнаті.
     * @param {string} ns
     * @param {string} room
     * @returns {Promise<number>}
     */
    async getCountInRoom(ns, room) {
        const key = this._buildKey(ns, room)
        const set = this._rooms.get(key)
        return set ? set.size : 0
    }

    /**
     * Повертає список всіх ID сокетів у неймспейсі.
     * @param {string} ns
     * @returns {Promise<string[]>}
     */

    async getUsersInNamespace(ns) {
        const users = new Set()
        const prefix = `${ns}:`
        for (const [key, set] of this._rooms.entries()) {
            if (key.startsWith(prefix)) {
                for (const socketId of set) {
                    users.add(socketId)
                }
            }
        }
        return Array.from(users)
    }

    /**
     * Рахує загальну кількість підключень у неймспейсі.
     * @param {string} ns
     * @returns {Promise<number>}
     */
    async getCountInNamespace(ns) {
        let count = 0
        const prefix = `${ns}:`

        for (const [key, set] of this._rooms.entries()) {
            if (key.startsWith(prefix)) {
                count += set.size
            }
        }
        return count
    }

    /**
     * Допоміжний метод для генерації ключів.
     * @private
     */
    _buildKey(ns, room) {
        return `${ns}:${room}`
    }

    /**
     * Повне очищення стану (для тестів).
     * @returns {Promise<void>}
     */
    async clear() {
        this._rooms.clear()
        this.logger.debug('State cleared')
    }
}
