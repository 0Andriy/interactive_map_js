/**
 * Простий In-Memory кеш для ключів з підтримкою TTL.
 */
class KeyCache {
    constructor() {
        this.cache = new Map()
    }

    /**
     * @param {string} id - Унікальний ідентифікатор (напр. "access:TEST")
     * @param {number} ttlMs - Час життя в мілісекундах
     * @param {Function} fetchFn - Функція, яка дістає дані, якщо їх немає в кеші
     */
    async getOrFetch(id, ttlMs, fetchFn) {
        const now = Date.now()
        const cached = this.cache.get(id)

        // Якщо дані є в кеші і вони не застаріли — повертаємо їх
        if (cached && now < cached.expiry) {
            return cached.data
        }

        // Якщо немає — виконуємо запит
        const data = await fetchFn()

        // Зберігаємо в кеш
        this.cache.set(id, {
            data,
            expiry: now + ttlMs,
        })

        return data
    }

    /** Очистити конкретний ключ (напр. при ротації) */
    invalidate(id) {
        this.cache.delete(id)
    }
}

export const keyCache = new KeyCache()
