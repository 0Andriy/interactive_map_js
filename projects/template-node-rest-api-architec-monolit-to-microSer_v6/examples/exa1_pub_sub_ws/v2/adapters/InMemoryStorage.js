import { IStorage } from '../interfaces/IStorage.js'
import { ILogger } from '../interfaces/ILogger.js'

/**
 * @class InMemoryStorage
 * @augments IStorage
 * @description Реалізація IStorage для монолітного режиму (зберігання в пам'яті).
 * НЕ є персистентним при перезапуску сервера.
 */
class InMemoryStorage extends IStorage {
    #data = new Map() // Map<key, value>
    #sets = new Map() // Map<key, Set<member>>
    #logger

    constructor(logger) {
        super()
        this.#logger = logger
        this.#logger.log('InMemoryStorage initialized.')
    }

    async get(key) {
        this.#logger.debug(`InMemoryStorage: Getting key '${key}'.`)
        return this.#data.get(key)
    }

    async set(key, value, ttl = 0) {
        this.#logger.debug(`InMemoryStorage: Setting key '${key}' with value:`, value)
        this.#data.set(key, value)
        if (ttl > 0) {
            setTimeout(() => {
                this.#logger.debug(`InMemoryStorage: Deleting expired key '${key}'.`)
                this.#data.delete(key)
            }, ttl * 1000)
        }
        return true
    }

    async delete(key) {
        this.#logger.debug(`InMemoryStorage: Deleting key '${key}'.`)
        return this.#data.delete(key)
    }

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

    async getSetMembers(key) {
        this.#logger.debug(`InMemoryStorage: Getting members of set '${key}'.`)
        const set = this.#sets.get(key)
        return set ? Array.from(set) : []
    }

    async getSetSize(key) {
        this.#logger.debug(`InMemoryStorage: Getting size of set '${key}'.`)
        const set = this.#sets.get(key)
        return set ? set.size : 0
    }

    async close() {
        this.#logger.log('InMemoryStorage closed (clearing data).')
        this.#data.clear()
        this.#sets.clear()
    }
}

export { InMemoryStorage }
