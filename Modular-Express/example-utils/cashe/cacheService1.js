import { createClient } from 'redis'
import NodeCache from 'node-cache'

/**
 * СТРАТЕГІЇ ЗБЕРІГАННЯ
 */
class RedisStore {
    constructor(url) {
        this.client = createClient({ url })
        this.client.connect().catch(console.error)
    }
    async get(key) {
        const data = await this.client.get(key)
        return data ? JSON.parse(data) : null
    }
    async set(key, value, ttl) {
        await this.client.set(key, JSON.stringify(value), { EX: ttl })
    }
    async del(key) {
        await this.client.del(key)
    }
    async delByPattern(pattern) {
        let cursor = 0
        do {
            const reply = await this.client.scan(cursor, { MATCH: pattern, COUNT: 100 })
            cursor = reply.cursor
            if (reply.keys.length > 0) await this.client.del(reply.keys)
        } while (cursor !== 0)
    }
    async lock(key, ttl = 10) {
        const res = await this.client.set(`lock:${key}`, '1', { NX: true, EX: ttl })
        return res === 'OK'
    }
    async unlock(key) {
        await this.client.del(`lock:${key}`)
    }
}

class LocalStore {
    constructor() {
        this.cache = new NodeCache()
    }
    async get(key) {
        return this.cache.get(key)
    }
    async set(key, value, ttl) {
        this.cache.set(key, value, ttl)
    }
    async del(key) {
        this.cache.del(key)
    }
    async delByPattern(pattern) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*'))
        const keys = this.cache.keys().filter((k) => regex.test(k))
        keys.forEach((k) => this.cache.del(k))
    }
    async lock() {
        return true
    } // Локально Race Condition менш критичний
    async unlock() {}
}

/**
 * СЕРВІС КЕШУВАННЯ
 */
const store =
    process.env.CACHE_DRIVER === 'redis'
        ? new RedisStore(process.env.REDIS_URL || 'redis://localhost:6379')
        : new LocalStore()

const wait = (ms) => new Promise((res) => setTimeout(res, ms))

/**
 * Генерація ключа на основі параметрів шляху та query.
 */
const generateKey = (prefix, req, isPrivate) => {
    const paramsPart = Object.entries(req.params)
        .map(([k, v]) => `${k}:${v}`)
        .join(':')
    const query = Object.keys(req.query)
        .sort()
        .map((k) => `${k}=${req.query[k]}`)
        .join('&')
    const userPart = isPrivate && req.user?.id ? `user:${req.user.id}:` : ''
    return `cache:${userPart}${prefix}:${paramsPart || 'root'}${query ? '?' + query : ''}`
}

/**
 * @callback Middleware
 */

/**
 * Advanced Middleware для кешування з захистом від Cache Stampede.
 * @param {Object} opts
 * @param {string} opts.prefix - Категорія (напр. 'tasks')
 * @param {number} [opts.ttl=3600] - Час життя (сек)
 * @param {boolean} [opts.isPrivate=false] - Чи додавати userId до ключа
 */
export const cacheMiddleware =
    ({ prefix, ttl = 3600, isPrivate = false }) =>
    async (req, res, next) => {
        const key = generateKey(prefix, req, isPrivate)
        try {
            let cached = await store.get(key)

            if (!cached) {
                const acquired = await store.lock(key)
                if (!acquired) {
                    let attempts = 0
                    while (!cached && attempts < 15) {
                        await wait(200)
                        cached = await store.get(key)
                        attempts++
                    }
                    if (cached) return res.json(cached)
                }
            } else {
                res.setHeader('X-Cache', 'HIT')
                return res.json(cached)
            }

            res.setHeader('X-Cache', 'MISS')
            const originalSend = res.send
            res.send = function (body) {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    store.set(key, typeof body === 'string' ? JSON.parse(body) : body, ttl)
                }
                store.unlock(key)
                return originalSend.call(this, body)
            }
            next()
        } catch (err) {
            store.unlock(key)
            next()
        }
    }

/**
 * Middleware для очищення кешу.
 * @param {Object} opts
 * @param {string} opts.prefix - Категорія
 * @param {boolean} [opts.isPrivate=false] - Очистити лише для поточного юзера
 * @param {'exact'|'parent'|'all'} [opts.scope='all'] - Глибина очищення
 */
export const invalidateCache =
    ({ prefix, isPrivate = false, scope = 'all' }) =>
    async (req, res, next) => {
        try {
            const userPart = isPrivate && req.user?.id ? `user:${req.user.id}:` : ''
            if (scope === 'exact') {
                await store.del(generateKey(prefix, req, isPrivate))
            } else {
                const pattern =
                    scope === 'parent' && req.params.taskId
                        ? `cache:${userPart}${prefix}:taskId:${req.params.taskId}:*`
                        : `cache:${userPart}${prefix}:*`
                await store.delByPattern(pattern)
            }
        } catch (err) {
            console.error('[Cache Invalidation Error]', err)
        }
        next()
    }
