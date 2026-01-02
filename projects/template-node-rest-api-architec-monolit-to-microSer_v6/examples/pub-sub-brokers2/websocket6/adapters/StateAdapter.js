// adapters/StateAdapter.js
export class RedisStateAdapter {
    constructor(redisClient, logger) {
        this.redis = redisClient
        this.logger = logger.child('StateAdapter')
        this.keyPrefix = 'socket_io:rooms:'
    }

    async addUserToRoom(ns, room, socketId) {
        const key = `${this.keyPrefix}${ns}:${room}`
        try {
            await this.redis.sadd(key, socketId)
            await this.redis.expire(key, 86400) // 24h
            this.logger.debug(`Socket ${socketId} added to ${key}`)
        } catch (err) {
            this.logger.error('Error adding user to state', err)
        }
    }

    async removeUserFromRoom(ns, room, socketId) {
        const key = `${this.keyPrefix}${ns}:${room}`
        try {
            await this.redis.srem(key, socketId)
            this.logger.debug(`Socket ${socketId} removed from ${key}`)
        } catch (err) {
            this.logger.error('Error removing user from state', err)
        }
    }

    async getUsersInRoom(ns, room) {
        const key = `${this.keyPrefix}${ns}:${room}`
        try {
            return await this.redis.smembers(key)
        } catch (err) {
            this.logger.error('Error getting users', err)
            return []
        }
    }
}
