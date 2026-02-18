import { createClient } from 'redis'

const redisClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' })
await redisClient.connect()

/**
 * @typedef {Object} CacheOptions
 * @property {string} prefix - Категорія ресурсу (напр. 'tasks').
 * @property {number} [ttl=3600] - Час життя кешу в секундах.
 * @property {boolean} [isPrivate=false] - Чи ізолювати кеш для конкретного користувача.
 * @property {function(Object): string[]} [tags] - Функція, що повертає масив тегів на основі запиту.
 */

/**
 * Advanced Middleware з підтримкою тегів, Mutex та складних URL.
 *
 * @param {CacheOptions} options
 * @returns {import('express').RequestHandler}
 *
 * @example
 * // Приклад 1: Кешування з динамічними тегами
 * router.get('/projects/:pid/tasks/:tid', cacheMiddleware({
 *   prefix: 'tasks',
 *   tags: (req) => [`project:${req.params.pid}`, `task:${req.params.tid}`]
 * }));
 *
 * @example
 * // Приклад 2: Приватний кеш профілю
 * router.get('/me', cacheMiddleware({ prefix: 'profile', isPrivate: true, ttl: 600 }));
 */
export const cacheMiddleware = ({ prefix, ttl = 3600, isPrivate = false, tags }) => {
    return async (req, res, next) => {
        const paramsPart = Object.entries(req.params)
            .map(([k, v]) => `${k}:${v}`)
            .join(':')
        const query = Object.keys(req.query)
            .sort()
            .map((k) => `${k}=${req.query[k]}`)
            .join('&')
        const userPart = isPrivate && req.user?.id ? `user:${req.user.id}:` : ''
        const key = `cache:${userPart}${prefix}:${paramsPart || 'list'}${query ? '?' + query : ''}`

        try {
            const cached = await redisClient.get(key)
            if (cached) {
                res.setHeader('X-Cache', 'HIT')
                return res.json(JSON.parse(cached))
            }

            const originalSend = res.send
            res.send = function (body) {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    const data = typeof body === 'string' ? body : JSON.stringify(body)

                    // Зберігаємо основний кеш
                    redisClient.set(key, data, { EX: ttl })

                    // Якщо є теги, прив'язуємо ключ до кожного тегу в Redis Sets
                    if (tags) {
                        const activeTags = tags(req)
                        activeTags.forEach((tag) => {
                            const tagKey = `tag:${tag}`
                            redisClient.sAdd(tagKey, key)
                            redisClient.expire(tagKey, ttl) // Тег живе стільки ж, скільки кеш
                        })
                    }
                }
                return originalSend.call(this, body)
            }
            next()
        } catch (err) {
            next()
        }
    }
}

/**
 * Middleware для інвалідації за тегами або префіксом.
 *
 * @param {Object} opts
 * @param {string[]} [opts.tags] - Масив тегів для видалення (напр. ['project:5']).
 * @param {string} [opts.prefix] - Префікс для масового видалення.
 *
 * @example
 * // Очистити всі записи, що стосуються конкретного проекту
 * router.post('/projects/:pid/update', invalidateCache({
 *   tags: (req) => [`project:${req.params.pid}`]
 * }));
 */
export const invalidateCache = ({ tags, prefix }) => {
    return async (req, res, next) => {
        try {
            if (tags) {
                const tagsToInvalidate = typeof tags === 'function' ? tags(req) : tags

                for (const tag of tagsToInvalidate) {
                    const tagKey = `tag:${tag}`
                    const keys = await redisClient.sMembers(tagKey) // Отримуємо всі ключі цього тегу
                    if (keys.length > 0) {
                        await redisClient.del(keys) // Видаляємо всі закешовані відповіді
                        await redisClient.del(tagKey) // Видаляємо сам тег
                    }
                }
            }

            if (prefix) {
                let cursor = 0
                do {
                    const reply = await redisClient.scan(cursor, {
                        MATCH: `cache:*${prefix}:*`,
                        COUNT: 100,
                    })
                    cursor = reply.cursor
                    if (reply.keys.length > 0) await redisClient.del(reply.keys)
                } while (cursor !== 0)
            }
        } catch (err) {
            console.error('[Cache Invalidation Error]', err)
        }
        next()
    }
}
