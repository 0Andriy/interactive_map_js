import { IStorage } from '../interfaces/IStorage.js'
import { ILogger } from '../interfaces/ILogger.js'

/**
 * @class InMemoryStorage
 * @augments IStorage
 * @description Реалізація IStorage для монолітного режиму (зберігання в пам'яті).
 * НЕ є персистентним при перезапуску сервера.
 */
class InMemoryStorage extends IStorage {
    /**
     * Internal map for storing key-value pairs.
     * @private
     * @type {Map<string, any>}
     */
    #data = new Map()

    /**
     * Internal map for storing sets.
     * @private
     * @type {Map<string, Set<any>>}
     */
    #sets = new Map()

    /**
     * The logger instance used for logging debug and info messages.
     * @private
     * @type {ILogger}
     */
    #logger

    /**
     * Creates an instance of InMemoryStorage.
     * @param {ILogger} logger The logger instance.
     */
    constructor(logger) {
        super()
        this.#logger = logger
        this.#logger.info('InMemoryStorage initialized.')
    }

    /**
     * Retrieves the value associated with a given key.
     * @param {string} key The key to retrieve.
     * @returns {Promise<any | undefined>} A promise that resolves with the value, or `undefined` if the key does not exist.
     */
    async get(key) {
        this.#logger.debug(`InMemoryStorage: Getting key '${key}'.`)
        return this.#data.get(key)
    }

    /**
     * Sets a key-value pair and optionally an expiration time (Time to Live).
     * @param {string} key The key to set.
     * @param {any} value The value to store.
     * @param {number} [ttl=0] The time to live in seconds. A value of 0 means no expiration.
     * @returns {Promise<boolean>} A promise that resolves with `true` upon success.
     */
    async set(key, value, ttl = 0) {
        this.#logger.debug(`InMemoryStorage: Setting key '${key}' ttl: ${ttl} with value:`, value)
        this.#data.set(key, value)
        if (ttl > 0) {
            setTimeout(() => {
                this.#logger.debug(`InMemoryStorage: Deleting expired key '${key}'.`)
                this.#data.delete(key)
            }, ttl * 1000)
        }
        return true
    }

    /**
     * Deletes a key and its associated value.
     * @param {string} key The key to delete.
     * @returns {Promise<boolean>} A promise that resolves with `true` if the key was deleted, or `false` if it did not exist.
     */
    async delete(key) {
        this.#logger.debug(`InMemoryStorage: Deleting key '${key}'.`)
        return this.#data.delete(key)
    }

    /**
     * Retrieves all keys that match a given glob-style pattern.
     * @param {string} pattern The glob pattern (e.g., 'user:*', 'item:*').
     * @returns {Promise<string[]>} A promise that resolves with an array of matching keys.
     */
    async listKeys(pattern) {
        this.#logger.debug(`InMemoryStorage: Listing keys matching '${pattern}'.`)
        const regex = new RegExp(pattern.replace(/\*/g, '.*'))
        const keys = []
        for (const key of this.#data.keys()) {
            if (regex.test(key)) {
                keys.push(key)
            }
        }
        return keys
    }

    /**
     * Adds a member to a set stored at a given key.
     * @param {string} key The key of the set.
     * @param {any} member The member to add to the set.
     * @returns {Promise<boolean>} A promise that resolves with `true` if the member was newly added, or `false` if it already existed.
     */
    async addToSet(key, member) {
        this.#logger.debug(`InMemoryStorage: Adding '${member}' to set '${key}'.`)
        if (!this.#sets.has(key)) {
            this.#sets.set(key, new Set())
        }
        const set = this.#sets.get(key)
        const added = !set.has(member) // Перевіряємо, чи новий елемент
        set.add(member)
        return added
    }

    /**
     * Removes a member from a set stored at a given key.
     * @param {string} key The key of the set.
     * @param {any} member The member to remove.
     * @returns {Promise<boolean>} A promise that resolves with `true` if the member was removed, or `false` if it did not exist in the set.
     */
    async removeFromSet(key, member) {
        this.#logger.debug(`InMemoryStorage: Removing '${member}' from set '${key}'.`)
        const set = this.#sets.get(key)
        if (set) {
            const deleted = set.delete(member)
            if (set.size === 0) {
                this.#sets.delete(key) // Видаляємо порожній сет
            }
            return deleted
        }
        return false
    }

    /**
     * Retrieves all members of a set.
     * @param {string} key The key of the set.
     * @returns {Promise<any[]>} A promise that resolves with an array of all members in the set, or an empty array if the set does not exist.
     */
    async getSetMembers(key) {
        this.#logger.debug(`InMemoryStorage: Getting members of set '${key}'.`)
        const set = this.#sets.get(key)
        return set ? Array.from(set) : []
    }

    /**
     * Retrieves the number of members in a set.
     * @param {string} key The key of the set.
     * @returns {Promise<number>} A promise that resolves with the size of the set, or 0 if the set does not exist.
     */
    async getSetSize(key) {
        this.#logger.debug(`InMemoryStorage: Getting size of set '${key}'.`)
        const set = this.#sets.get(key)
        return set ? set.size : 0
    }

    /**
     * Clears all stored data and sets, effectively closing the storage.
     * @returns {Promise<void>} A promise that resolves when the operation is complete.
     */
    async close() {
        this.#logger.log('InMemoryStorage closed (clearing data).')
        this.#data.clear()
        this.#sets.clear()
    }
}

export { InMemoryStorage }
