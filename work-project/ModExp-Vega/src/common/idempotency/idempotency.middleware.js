/**
 * @fileoverview Опис проміжного шару (middleware) для контролю ідемпотентності запитів.
 */

/**
 * Фабрика для створення middleware захисту ідемпотентності.
 *
 * @param {IdempotencyStorage} storage Екземпляр сховища (Memory або Redis), переданий через DI.
 * @returns {ExpressMiddleware} Налаштований Express middleware.
 */
export const createIdempotencyGuard = (storage, logger = console) => {
    return async (req, res, next) => {
        /** @type {string|undefined} */
        const key = req.headers['idempotency-key']
        const allowedMethods = ['POST', 'PATCH']

        // Якщо ключа немає, ідемпотентність не потрібна
        if (!key) {
            return next()
        }

        // Ідемпотентність застосовується лише для POST та PATCH методів
        if (
            (req.method !== 'POST' && req.method !== 'PATCH') ||
            !allowedMethods.includes(req.method)
        ) {
            return next()
        }

        const lockKey = `lock:${key}`
        const dataKey = `idemp:${key}`

        try {
            // 1. Race Condition: Блокуємо ключ на 15 секунд (використовуємо NX)
            const isLocked = await storage.set(lockKey, 'true', { NX: true, EX: 15 })

            if (!isLocked) {
                return res.status(409).json({
                    error: 'Request is already being processed. Please wait.',
                })
            }

            // 2. Ідемпотентність: перевіряємо наявність результату
            const savedResponse = await storage.get(dataKey)
            if (savedResponse) {
                const { status, body } = JSON.parse(savedResponse)
                await storage.del(lockKey) // Знімаємо блок
                return res.status(status).json(body)
            }

            // 3. Перехоплення відповіді для кешування
            const originalJson = res.json
            res.json = function (body) {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    // Зберігаємо на 24 години
                    storage.set(dataKey, JSON.stringify({ status: res.statusCode, body }), {
                        EX: 86400,
                    })
                }

                storage.del(lockKey).catch((err) => logger?.error?.('Lock release failed', err))
                return originalJson.call(this, body)
            }

            next()
        } catch (error) {
            await storage.del(lockKey).catch(() => {})
            next(error)
        }
    }
}
