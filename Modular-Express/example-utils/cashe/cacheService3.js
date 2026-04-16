import { createClient } from 'redis'
import NodeCache from 'node-cache'
import axios from 'axios'

/**
 * @typedef {Object} CacheOptions
 * @property {string} prefix - Категорія (напр. 'tasks', 'users')
 * @property {number} [ttl=3600] - Час життя в секундах
 * @property {boolean} [isPrivate=false] - Ізоляція кешу за ID користувача
 * @property {function(import('express').Request): string[]} [tags] - Динамічні теги
 */

// --- СТРАТЕГІЇ ЗБЕРІГАННЯ ---

class RedisStore {
    constructor(url) {
        this.client = createClient({ url })
        this.client.connect().catch((err) => console.error('Redis Connect Error', err))
    }
    async get(key) {
        const data = await this.client.get(key)
        return data ? JSON.parse(data) : null
    }
    async set(key, value, ttl) {
        await this.client.set(key, JSON.stringify(value), { EX: ttl })
    }
    async del(keys) {
        if (keys.length) await this.client.del(keys)
    }

    async getByTag(tag) {
        return await this.client.sMembers(`tag:${tag}`)
    }
    async addTag(tag, key, ttl) {
        await this.client.sAdd(`tag:${tag}`, key)
        await this.client.expire(`tag:${tag}`, ttl)
    }
    async delTag(tag) {
        await this.client.del(`tag:${tag}`)
    }

    async lock(key, ttl = 10) {
        const res = await this.client.set(`lock:${key}`, '1', { NX: true, EX: ttl })
        return res === 'OK'
    }
    async unlock(key) {
        await this.client.del(`lock:${key}`)
    }

    async scan(pattern) {
        let keys = []
        let cursor = 0
        do {
            const reply = await this.client.scan(cursor, { MATCH: pattern, COUNT: 100 })
            cursor = reply.cursor
            keys.push(...reply.keys)
        } while (cursor !== 0)
        return keys
    }
}

class LocalStore {
    constructor() {
        this.cache = new NodeCache()
        this.tags = new Map() // Реалізація тегів для локальної пам'яті
    }
    async get(key) {
        return this.cache.get(key)
    }
    async set(key, value, ttl) {
        this.cache.set(key, value, ttl)
    }
    async del(keys) {
        ;[].concat(keys).forEach((k) => this.cache.del(k))
    }

    async getByTag(tag) {
        return Array.from(this.tags.get(tag) || [])
    }
    async addTag(tag, key) {
        if (!this.tags.has(tag)) this.tags.set(tag, new Set())
        this.tags.get(tag).add(key)
    }
    async delTag(tag) {
        this.tags.delete(tag)
    }

    async lock() {
        return true
    } // Локально lock не критичний
    async unlock() {}
    async scan(pattern) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*'))
        return this.cache.keys().filter((k) => regex.test(k))
    }
}

// --- ІНІЦІАЛІЗАЦІЯ ---

const store =
    process.env.CACHE_DRIVER === 'redis' ? new RedisStore(process.env.REDIS_URL) : new LocalStore()

const wait = (ms) => new Promise((res) => setTimeout(res, ms))

const generateKey = (prefix, req, isPrivate) => {
    const params = Object.entries(req.params)
        .map(([k, v]) => `${k}:${v}`)
        .join(':')
    const query = Object.keys(req.query)
        .sort()
        .map((k) => `${k}=${req.query[k]}`)
        .join('&')
    const userPart = isPrivate && req.user?.id ? `user:${req.user.id}:` : ''
    // Використовуємо req.baseUrl + req.path для точного шляху без домену
    const path = (req.baseUrl + req.path).replace(/\/$/, '')
    return `cache:${userPart}${prefix}:${path}:${params || 'root'}${query ? '?' + query : ''}`
}

// --- MIDDLEWARES ---

/**
 * Advanced Cache Middleware
 */
export const cacheMiddleware =
    ({ prefix, ttl = 3600, isPrivate = false, tags }) =>
    async (req, res, next) => {
        if (req.headers['x-no-cache'] === 'true') return next()

        const key = generateKey(prefix, req, isPrivate)

        try {
            let cached = await store.get(key)

            // Mutex захист (Cache Stampede)
            if (!cached) {
                const acquired = await store.lock(key)
                if (!acquired) {
                    let attempts = 0
                    while (!cached && attempts < 10) {
                        await wait(250)
                        cached = await store.get(key)
                        attempts++
                    }
                    if (cached) {
                        res.setHeader('X-Cache', 'HIT-ASYNC')
                        return res.json(cached)
                    }
                }
            } else {
                res.setHeader('X-Cache', 'HIT')
                return res.json(cached)
            }

            res.setHeader('X-Cache', 'MISS')
            const originalSend = res.send

            res.send = function (body) {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    const data = typeof body === 'string' ? JSON.parse(body) : body
                    store.set(key, data, ttl)

                    if (tags) {
                        const activeTags = tags(req)
                        activeTags.forEach((t) => store.addTag(t, key, ttl))
                    }
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
 * Advanced Invalidation Middleware with Warming
 */
export const invalidateCache =
    ({ tags, prefix, warming = false }) =>
    async (req, res, next) => {
        try {
            const urlsToWarm = new Set()

            if (tags) {
                const activeTags = typeof tags === 'function' ? tags(req) : tags
                for (const tag of activeTags) {
                    const keys = await store.getByTag(tag)
                    if (keys.length) {
                        if (warming) {
                            // Витягуємо чистий шлях з ключа для axios
                            keys.forEach((k) => {
                                const parts = k.split(':')
                                const urlIdx = parts.findIndex((p) => p.startsWith('/'))
                                if (urlIdx !== -1) urlsToWarm.add(parts[urlIdx])
                            })
                        }
                        await store.del(keys)
                        await store.delTag(tag)
                    }
                }
            }

            if (prefix) {
                const pattern = `cache:*${prefix}:*`
                const keys = await store.scan(pattern)
                await store.del(keys)
            }

            // Cache Warming (Фоновий прогрів)
            if (warming && urlsToWarm.size > 0) {
                const baseUrl = `${req.protocol}://${req.get('host')}`
                urlsToWarm.forEach((path) => {
                    axios
                        .get(`${baseUrl}${path}`, {
                            headers: {
                                'x-cache-warmer': 'true',
                                authorization: req.headers.authorization,
                            },
                        })
                        .catch(() => null) // "Fire and forget"
                })
            }
        } catch (err) {
            console.error('[Cache Invalidation Error]', err)
        }
        next()
    }

//     // GET /api/v1/courses/node-js/lessons/15
// router.get('/courses/:cSlug/lessons/:lId',
//     cacheMiddleware({
//         prefix: 'edu',
//         ttl: 86400,
//         tags: (req) => [`course:${req.params.cSlug}`, `lesson:${req.params.lId}`]
//     }),
//     async (req, res) => { ... }
// );

// // Оновлення курсу викличе прогрів усіх закешованих уроків цього курсу
// router.patch('/courses/:cSlug',
//     invalidateCache({
//         tags: (req) => [`course:${req.params.cSlug}`],
//         warming: true
//     }),
//     async (req, res) => { ... }
// );

// router.get('/my-settings',
//     auth,
//     cacheMiddleware({ prefix: 'settings', isPrivate: true }),
//     (req, res) => { ... }
// );
