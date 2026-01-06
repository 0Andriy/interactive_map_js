// Реалізація через Redis (для Production)
export class RedisStateAdapter {
    constructor(redisClient, logger) {
        this.redis = redisClient
        this.logger = logger.child('RedisState')
        this.keyPrefix = 'socket_io:rooms:'
    }

    async addUserToRoom(ns, room, socketId) {
        const key = `${this.keyPrefix}${ns}:${room}`
        await this.redis.sadd(key, socketId)
        await this.redis.expire(key, 86400)
    }

    async removeUserFromRoom(ns, room, socketId) {
        await this.redis.srem(`${this.keyPrefix}${ns}:${room}`, socketId)
    }

    async getUsersInRoom(ns, room) {
        return await this.redis.smembers(`${this.keyPrefix}${ns}:${room}`)
    }

    async isUserInRoom(ns, room, socketId) {
        const res = await this.redis.sismember(`${this.keyPrefix}${ns}:${room}`, socketId)
        return res === 1
    }

    async getCountInRoom(ns, room) {
        return await this.redis.scard(`${this.keyPrefix}${ns}:${room}`)
    }

    async getUsersInNamespace(ns) {
        const keys = await this.redis.keys(`${this.keyPrefix}${ns}:*`)
        const allUsers = new Set()
        for (const key of keys) {
            const members = await this.redis.smembers(key)
            members.forEach((m) => allUsers.add(m))
        }

        return Array.from(allUsers)
    }

    async getCountInNamespace(ns) {
        // У 2026 для точності в кластері використовуємо SCAN або окремий лічильник
        const keys = await this.redis.keys(`${this.keyPrefix}${ns}:*`)
        let total = 0
        for (const key of keys) {
            total += await this.redis.scard(key)
        }
        return total
    }
}
