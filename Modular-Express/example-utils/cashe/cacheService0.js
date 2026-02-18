import { createClient } from 'redis'

/**
 * @typedef {import('express').Request} Request
 * @typedef {import('express').Response} Response
 * @typedef {import('express').NextFunction} NextFunction
 */

const redisClient = createClient({ url: 'redis://localhost:6379' })
redisClient.on('error', (err) => console.error('Redis Error:', err))
await redisClient.connect()

/**
 * Покращена генерація ключів з урахуванням користувача та сортуванням параметрів.
 *
 * @param {string} prefix - Категорія ресурсу (напр. 'products', 'orders').
 * @param {Request} req - Об'єкт запиту Express.
 * @param {boolean} isPrivate - Чи додавати ID користувача до ключа для персоналізації кешу.
 * @returns {string} Унікальний рядок ключа для Redis.
 *
 * @example
 * const key = generateKey('profile', req, true);
 * // Поверне: "cache:user:123:profile:/api/me?lang=uk"
 */
const generateKey = (prefix, req, isPrivate) => {
    const query = Object.keys(req.query)
        .sort()
        .map((k) => `${k}=${req.query[k]}`)
        .join('&')
    const userPart = isPrivate && req.user?.id ? `user:${req.user.id}:` : ''
    const queryPart = query ? `?${query}` : ''

    return `cache:${userPart}${prefix}:${req.path}${queryPart}`
}

/**
 * Advanced Middleware для кешування відповідей.
 *
 * @param {Object} options - Налаштування кешування.
 * @param {string} options.prefix - Назва групи ресурсу.
 * @param {number} [options.ttl=3600] - Час життя кешу в секундах (за замовчуванням 1 година).
 * @param {boolean} [options.isPrivate=false] - Якщо true, кеш створюється окремо для кожного `req.user.id`.
 * @returns {(req: Request, res: Response, next: NextFunction) => Promise<void>} Express Middleware.
 *
 * @example
 * // Кешування публічного списку товарів на 5 хвилин
 * router.get('/products', cacheMiddleware({ prefix: 'catalog', ttl: 300 }), getProducts);
 *
 * // Кешування приватного профілю користувача
 * router.get('/me', cacheMiddleware({ prefix: 'profile', isPrivate: true }), getProfile);
 */
export const cacheMiddleware = ({ prefix, ttl = 3600, isPrivate = false }) => {
    return async (req, res, next) => {
        const key = generateKey(prefix, req, isPrivate)

        try {
            const cached = await redisClient.get(key)
            if (cached) {
                res.setHeader('X-Cache', 'HIT')
                return res.json(JSON.parse(cached))
            }

            res.setHeader('X-Cache', 'MISS')
            const originalSend = res.send
            res.send = function (body) {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    redisClient.set(key, JSON.stringify(body), { EX: ttl })
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
 * Middleware для інвалідації (видалення) кешу при зміні даних.
 *
 * @param {Object} options - Налаштування інвалідації.
 * @param {string} options.prefix - Назва групи, кеш якої потрібно очистити.
 * @param {boolean} [options.isPrivate=false] - Якщо true, видалить кеш лише поточного користувача.
 * @param {boolean} [options.exactPath=false] - Якщо true, видалить кеш лише поточного URL. Якщо false — весь кеш префікса.
 * @returns {(req: Request, res: Response, next: NextFunction) => Promise<void>} Express Middleware.
 *
 * @example
 * // Очистити ВЕСЬ кеш каталогу при додаванні нового товару
 * router.post('/products', invalidateCache({ prefix: 'catalog' }), createProduct);
 *
 * // Очистити лише кеш профілю поточного користувача при оновленні
 * router.put('/me', invalidateCache({ prefix: 'profile', isPrivate: true }), updateProfile);
 */
export const invalidateCache = ({ prefix, isPrivate = false, exactPath = false }) => {
    return async (req, res, next) => {
        try {
            if (exactPath) {
                const key = generateKey(prefix, req, isPrivate)
                await redisClient.del(key)
            } else {
                const userPart = isPrivate && req.user?.id ? `user:${req.user.id}:` : ''
                const pattern = `cache:${userPart}${prefix}:*`

                let cursor = 0
                do {
                    const reply = await redisClient.scan(cursor, { MATCH: pattern, COUNT: 100 })
                    cursor = reply.cursor
                    if (reply.keys.length > 0) await redisClient.del(reply.keys)
                } while (cursor !== 0)
            }
        } catch (err) {
            console.error('[Cache Invalidation] Error:', err)
        }
        next()
    }
}

/**
 * Advanced Middleware з підтримкою тегів для точкової інвалідації.
 *
 * @param {Object} options
 * @param {string} options.prefix - Префікс ключа.
 * @param {string[]} [options.tags] - Функція або масив тегів (напр. `['product_42']`).
 *
 * @example
 * // Кешуємо конкретний товар і тегаємо його ID
 * router.get('/products/:id', cacheWithTags({
 *   prefix: 'item',
 *   tags: (req) => [`product:${req.params.id}`]
 * }), getProduct);
 */
export const cacheWithTags = ({ prefix, ttl = 3600, tags = [] }) => {
    return async (req, res, next) => {
        const key = generateKey(prefix, req, false)
        const resolvedTags = typeof tags === 'function' ? tags(req) : tags

        const cached = await redisClient.get(key)
        if (cached) return res.json(JSON.parse(cached))

        const originalSend = res.send
        res.send = function (body) {
            if (res.statusCode === 200) {
                // 1. Зберігаємо сам кеш
                redisClient.set(key, JSON.stringify(body), { EX: ttl })

                // 2. Прив'язуємо цей ключ до кожного тегу
                resolvedTags.forEach((tag) => {
                    redisClient.sAdd(`tag:${tag}`, key)
                    redisClient.expire(`tag:${tag}`, ttl)
                })
            }
            return originalSend.call(this, body)
        }
        next()
    }
}

/**
 * Очищення кешу за тегами (миттєво видаляє всі пов'язані записи).
 *
 * @param {string[]} tags - Список тегів для видалення.
 *
 * @example
 * // При оновленні товару видаляємо кеш всюди, де він згадувався
 * router.put('/products/:id', async (req, res) => {
 *   await updateProduct(req.params.id);
 *   await invalidateByTags([`product:${req.params.id}`]);
 *   res.send('Updated');
 * });
 */
export const invalidateByTags = async (tags) => {
    for (const tag of tags) {
        const tagName = `tag:${tag}`
        const keys = await redisClient.sMembers(tagName) // Отримуємо всі ключі, пов'язані з тегом

        if (keys.length > 0) {
            await redisClient.del(keys) // Видаляємо всі закешовані сторінки
            await redisClient.del(tagName) // Видаляємо сам тег
        }
    }
}
