export class UniversalPoller {
    /**
     * @param {Object} config
     * @param {Function} config.fetchFn - (onlineKeys, ...args) => Promise<Array>
     * @param {Function} config.getOnlineKeysFn - () => Promise<Array>
     * @param {Function} config.cacheKeyFn - Елемент масиву -> Ключ кешу (наприклад, item => item.userId)
     * @param {Function} [config.fingerprintFn] - Опціонально: кастомна функція відбитку для одного елемента
     * @param {string} [config.modulePrefix] - Префікс для логів
     * @param {number} [config.intervalMs] - Інтервал пулінгу
     * @param {number} [config.cacheTtlSec] - Час життя кешу (0 - без ліміту)
     */
    constructor({
        fetchFn,
        fetchArgs = [],
        getOnlineKeysFn,
        cacheKeyFn,
        fingerprintFn = null, // 👈 Кастомний генератор відбитку об'єкта
        modulePrefix = 'global',
        intervalMs = 5000,
        cacheTtlSec = 3600,
    }) {
        this.fetchFn = fetchFn
        this.fetchArgs = fetchArgs
        this.getOnlineKeysFn = getOnlineKeysFn
        this.cacheKeyFn = cacheKeyFn
        this.fingerprintFn = fingerprintFn
        this.intervalMs = intervalMs
        this.cacheTtlMs = cacheTtlSec * 1000
        this.modulePrefix = modulePrefix

        this.timer = null
        this.cache = new Map() // Ключ -> { data, updatedAt, fingerprint }
        this.listeners = new Set()
    }

    start() {
        if (this.timer) return
        this.tick()
    }

    async tick() {
        try {
            const onlineKeys = await this.getOnlineKeysFn()
            const now = Date.now()

            // 1. Очищення пам'яті: прибираємо офлайн або застарілі за TTL дані
            for (const [cachedKey, cacheItem] of this.cache.entries()) {
                const isOffline = !onlineKeys.includes(cachedKey)
                const isExpired = this.cacheTtlMs > 0 && now - cacheItem.updatedAt > this.cacheTtlMs

                if (isOffline || isExpired) {
                    this.cache.delete(cachedKey)
                }
            }

            // 2. Якщо є активні користувачі — робимо запит
            if (onlineKeys && onlineKeys.length > 0) {
                const freshData = await this.fetchFn(onlineKeys, ...this.fetchArgs)
                const groupedData = this.groupByKey(freshData, this.cacheKeyFn)

                for (const key of onlineKeys) {
                    const currentData = groupedData[key] || []
                    const currentFingerprint = this.getGroupFingerprint(currentData)
                    const cached = this.cache.get(key)

                    // 3. Порівняння за допомогою легких хешів/відбитків
                    if (!cached || cached.fingerprint !== currentFingerprint) {
                        this.cache.set(key, {
                            data: currentData,
                            updatedAt: Date.now(),
                            fingerprint: currentFingerprint,
                        })

                        this.emit(key, currentData)
                    }
                }
            }
        } catch (error) {
            console.error(`[UniversalPoller][${this.modulePrefix}] Error:`, error)
        } finally {
            this.timer = setTimeout(() => this.tick(), this.intervalMs)
        }
    }

    // Створює один рядок-відбиток для всього масиву даних користувача
    getGroupFingerprint(data) {
        if (!data || data.length === 0) return 'empty'

        // Якщо розробник передав свою функцію — використовуємо її
        if (this.fingerprintFn) {
            return data.map((item) => this.fingerprintFn(item)).join('|')
        }

        // Страховочний дефолтний варіант (швидкий, шукає базові поля)
        return data
            .map((item) => {
                const id = item.id || item._id || ''
                const ver = item.updatedAt || item.version || item.status || ''
                return `${id}:${ver}`
            })
            .join('|')
    }

    groupByKey(data, keyFn) {
        return data.reduce((acc, item) => {
            const key = keyFn(item)
            if (!acc[key]) acc[key] = []
            acc[key].push(item)
            return acc
        }, {})
    }

    onUpdate(callback) {
        this.listeners.add(callback)
    }

    emit(key, data) {
        this.listeners.forEach((cb) => cb(key, data))
    }

    getCached(key) {
        return this.cache.get(key)?.data || []
    }

    stop() {
        if (this.timer) clearTimeout(this.timer)
        this.timer = null
    }
}

//

const notificationPoller = new UniversalPoller({
    modulePrefix: 'notifications',
    getOnlineKeysFn: async () => ['user_1', 'user_2'],
    fetchFn: async (userIds) => db.getUnreadNotifications(userIds),
    cacheKeyFn: (item) => item.userId,
    // Нам важливо знати, якщо у сповіщення змінився статус (наприклад, прочитано)
    fingerprintFn: (item) => `${item.id}:${item.status}`,
})

// fingerprintFn: (item) => Object.values(item).join('-') // Перетворить на "1-100"
