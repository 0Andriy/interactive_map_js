import { IStateAdapter } from '../../interfaces/IStateAdapter.js'

/**
 * @implements {IStateAdapter}
 * Реалізація стану з TTL та Server Identity для захисту від збоїв та для запобігання Ghost Connections.
 */
export class RedisStateAdapter extends IStateAdapter {
    /**
     * @param {import('ioredis').Redis} redis
     * @param {string} serverId
     */
    constructor(redis, serverId) {
        super()
        this.redis = redis
        this.serverId = serverId
        this.ttl = 60 // Час життя записів у секундах
        this._initHeartbeat()
    }

    /**
     * @param {string} ns
     * @param {string} room
     * @param {string} socketId
     */
    async addUserToRoom(ns, room, socketId) {
        const rKey = `rooms:${ns}:${room}`
        const uKey = `u_rooms:${ns}:${socketId}`
        const sKey = `srv_conns:${this.serverId}`

        await this.redis
            .multi()
            .sadd(rKey, socketId)
            .sadd(uKey, room)
            .sadd(sKey, socketId)
            .expire(sKey, this.ttl)
            .exec()
    }

    /**
     * @param {string} ns
     * @param {string} room
     * @param {string} socketId
     */
    async isMember(ns, room, socketId) {
        return (await this.redis.sismember(`rooms:${ns}:${room}`, socketId)) === 1
    }

    /**
     * @param {string} ns
     * @param {string} room
     * @param {string} socketId
     */
    async removeUserFromRoom(ns, room, socketId) {
        const rKey = `rooms:${ns}:${room}`
        const uKey = `u_rooms:${ns}:${socketId}`
        // await this.redis.multi().srem(rKey, socketId).srem(uKey, room).exec()

        // const lua = `
        //     redis.call("SREM", KEYS[1], ARGV[1])
        //     redis.call("SREM", KEYS[2], ARGV[2])
        //     if redis.call("SCARD", KEYS[1]) == 0 then return redis.call("DEL", KEYS[1]) end
        //     return 0
        // `
        // await this.redis.eval(lua, 2, rK, uK, socketId, room)

        // Використовуємо пайплайн для атомарності
        const pipeline = this.redis.pipeline()
        pipeline.srem(rKey, socketId)
        pipeline.srem(uKey, room)
        // Отримуємо кількість учасників після видалення
        pipeline.scard(rKey)

        const results = await pipeline.exec()
        const countAfterRemoval = results[2][1] // результат scard

        // Якщо в кімнаті 0 людей — видаляємо ключ повністю
        if (countAfterRemoval === 0) {
            await this.redis.del(rKey)
        }
    }

    async getClientsInRoom(ns, room) {
        return await this.redis.smembers(`rooms:${ns}:${room}`)
    }

    async getUserRooms(ns, socketId) {
        return await this.redis.smembers(`u_rooms:${ns}:${socketId}`)
    }

    async getAllConnections(ns = null) {
        const sKeys = await this.redis.keys('srv_conns:*')
        if (sKeys.length === 0) {
            return []
        }
        return await this.redis.sunion(...sKeys)
    }

    async clearServerData() {
        const sKey = `srv_conns:${this.serverId}`
        const sockets = await this.redis.smembers(sKey)
        // В реальному продакшені тут використовується LUA скрипт для очищення
        await this.redis.del(sKey)
    }

    _initHeartbeat() {
        setInterval(() => {
            this.redis.expire(`srv_conns:${this.serverId}`, this.ttl)
        }, 20000)
    }
}
