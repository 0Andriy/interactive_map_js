import { createClient } from 'redis'
import { IStorage } from '../interfaces/IStorage.js'
import { ILogger } from '../interfaces/ILogger.js'

class RedisStorage extends IStorage {
    #client
    #logger
    #config

    constructor(config, logger) {
        super()
        this.#logger = logger
        this.#config = config // Зберігаємо конфігурацію
        this.#logger.log('RedisStorage initialized.')
    }

    async connect() {
        if (this.#client && this.#client.isOpen) {
            this.#logger.debug('RedisStorage already connected.')
            return
        }
        this.#client = createClient(this.#config)
        this.#client.on('error', (err) => this.#logger.error('Redis Storage Error:', err))
        this.#client.on('connect', () => this.#logger.log('Redis Storage Connected.'))
        this.#client.on('ready', () => this.#logger.log('Redis Storage Ready.'))

        try {
            await this.#client.connect()
            this.#logger.log('Redis Storage client connected.')
        } catch (error) {
            this.#logger.error('Failed to connect Redis Storage client:', error)
            throw error
        }
    }

    async get(key) {
        try {
            const value = await this.#client.get(key)
            return value ? JSON.parse(value) : null
        } catch (e) {
            this.#logger.error(`Failed to get key '${key}' from Redis:`, e)
            return null
        }
    }

    async set(key, value, ttl = 0, options = {}) {
        // Додаємо параметр options
        try {
            const serializedValue = JSON.stringify(value)
            let result
            if (ttl > 0) {
                const args = [key, serializedValue, 'EX', ttl]
                if (options.NX) {
                    args.push('NX')
                }
                if (options.PX) {
                    // Якщо PX замість EX, то ttlMs
                    args[2] = 'PX'
                    args[3] = options.PX
                }
                result = await this.#client.set(key, serializedValue, {
                    EX: options.PX ? undefined : ttl, // Use EX if not PX
                    PX: options.PX, // Use PX if provided
                    NX: options.NX,
                    KEEPTTL: options.KEEPTTL, // Додаємо KEEPTTL якщо потрібно
                })
            } else {
                result = await this.#client.set(key, serializedValue, {
                    NX: options.NX,
                    KEEPTTL: options.KEEPTTL,
                })
            }
            // Для команд SET NX, Redis повертає null, якщо ключ вже існує, або 'OK'
            // Повертаємо true, якщо SET був успішним (OK або не null, якщо NX)
            // Повертаємо false, якщо SET NX не спрацював (повернув null)
            return result === 'OK' || (result !== null && options.NX)
        } catch (e) {
            this.#logger.error(`Failed to set key '${key}' in Redis:`, e)
            return false
        }
    }

    async delete(key) {
        try {
            return (await this.#client.del(key)) > 0
        } catch (e) {
            this.#logger.error(`Failed to delete key '${key}' from Redis:`, e)
            return false
        }
    }

    async listKeys(pattern) {
        // SCANS - більш ефективно для великих баз даних, ніж KEYS
        const keys = []
        let cursor = 0
        do {
            const result = await this.#client.scan(cursor, { MATCH: pattern, COUNT: 100 })
            cursor = parseInt(result.cursor)
            keys.push(...result.keys)
        } while (cursor !== 0)
        return keys
    }

    async addToSet(key, member) {
        try {
            return (await this.#client.sAdd(key, member)) > 0
        } catch (e) {
            this.#logger.error(`Failed to add '${member}' to set '${key}':`, e)
            return false
        }
    }

    async removeFromSet(key, member) {
        try {
            return (await this.#client.sRem(key, member)) > 0
        } catch (e) {
            this.#logger.error(`Failed to remove '${member}' from set '${key}':`, e)
            return false
        }
    }

    async getSetMembers(key) {
        try {
            return await this.#client.sMembers(key)
        } catch (e) {
            this.#logger.error(`Failed to get members of set '${key}':`, e)
            return []
        }
    }

    async getSetSize(key) {
        try {
            return await this.#client.sCard(key)
        } catch (e) {
            this.#logger.error(`Failed to get size of set '${key}':`, e)
            return 0
        }
    }

    async close() {
        if (this.#client && this.#client.isOpen) {
            await this.#client.quit()
        }
        this.#logger.log('Redis Storage client closed.')
    }
}

export { RedisStorage }
