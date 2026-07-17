// CacheClientDecorator.js
import { HttpClient } from './HttpClient.js'

export class CacheClientDecorator extends HttpClient {
    constructor(baseClient, config = {}) {
        super()

        if (!baseClient || typeof baseClient.request !== 'function') {
            throw new Error('[CacheClientDecorator] Base client is missing or invalid')
        }

        if (typeof config !== 'object' || config === null) {
            throw new TypeError('[CacheClientDecorator] Config must be an object')
        }

        this.client = baseClient
        this.cache = new Map()

        // Дефолтний TTL, якщо не передано інший
        this.defaultTtl = config.defaultTtl || 5 * 60 * 1000
    }

    async request(endpoint, options = {}) {
        const method = (options.method || 'GET').toUpperCase()
        const isGet = method === 'GET'

        // --- АВТОМАТИЧНА ІНВАЛІДАЦІЯ ПРИ ЗМІНІ ДАНИХ ---
        if (!isGet) {
            this._invalidateRelatedCache(endpoint)
            // Після очищення кешу просто передаємо запит далі на сервер
            return this.client.request(endpoint, options)
        }

        const cacheOptions = options.customCache //{ useCache: false, ttl: 0 }
        // Кешуємо тільки GET запити і тільки якщо явно вказано useCache: true
        if (!cacheOptions || !cacheOptions.useCache || !isGet) {
            return this.client.request(endpoint, options)
        }

        const now = Date.now()
        // Передаємо options у генератор ключа, щоб врахувати query-параметри та params
        const cacheKey = this._generateDeterministicKey(endpoint, options)

        // Визначаємо TTL: пріоритет у кастомного, якщо немає — беремо дефолтний
        const ttl = typeof cacheOptions.ttl === 'number' ? cacheOptions.ttl : this.defaultTtl

        // 1. Перевіряємо наявність кешу
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey)

            // Якщо кеш ще живий АБО якщо запит ще виконується (ttl <= 0, але проміс у процесі)
            if (cached && (now < cached.expiresAt || ttl <= 0)) {
                try {
                    const res = await cached.promise

                    // Повертаємо клон, якщо це нативний Response, або сам об'єкт, якщо це дані (JSON)
                    if (res && typeof res.clone === 'function') {
                        // Клонуємо відповідь, щоб різні частини додатку не мутували один і той самий об'єкт
                        return res.clone()
                    }

                    return res
                } catch (err) {
                    // Якщо проміс завершився помилкою, видаляємо його з кешу і прокидаємо помилку далі
                    this.cache.delete(cacheKey)
                    throw err
                }
            }

            // Якщо кеш протух (застарілий) за часом — видаляємо його
            this.cache.delete(cacheKey)
        }

        // 2. Якщо кешу немає, створюємо новий проміс запиту
        const requestPromise = this.client.request(endpoint, options)

        // Записуємо проміс у кеш. Якщо ttl <= 0, запис зафіксується тільки для паралельних запитів
        this.cache.set(cacheKey, {
            promise: requestPromise,
            timestamp: now,
            expiresAt: now + ttl,
            endpoint: endpoint, // Зберігаємо чистий ендпоінт для подальшого пошуку при інвалідації
        })

        try {
            const response = await requestPromise

            // Якщо сервер повернув HTTP-помилку (наприклад 404/500) АБО якщо ttl <= 0
            // (запит успішний, але довгостроково зберігати його в пам'яті не потрібно) — видаляємо з Map
            if (!response || !response.ok || ttl <= 0) {
                this.cache.delete(cacheKey)
                return response
            }

            return typeof response.clone === 'function' ? response.clone() : response
        } catch (err) {
            // Якщо сталася помилка мережі — негайно очищаємо кеш для цього ключа
            this.cache.delete(cacheKey)
            throw err
        }
    }

    /**
     * Внутрішній метод для пошуку та видалення зв'язаних ключів кешу
     * @private
     */
    _invalidateRelatedCache(mutationEndpoint) {
        // Отримуємо базовий корінь ресурсу (наприклад, з '/products/123/edit' або '/products?page=1' отримуємо 'products')
        const getResourceRoot = (url) => url.replace(/^\/+/, '').split(/[\/?#]/)[0]
        const mutationRoot = getResourceRoot(mutationEndpoint)

        for (const [key, cachedValue] of this.cache.entries()) {
            const cachedRoot = getResourceRoot(cachedValue.endpoint)

            // Якщо корінь ресурсу збігається, видаляємо цей запис із кешу.
            // Наприклад, POST /products очистить кеш для GET /products та GET /products?page=2
            if (mutationRoot === cachedRoot) {
                this.cache.delete(key)
            }
        }
    }

    /**
     * Повне очищення всього кешу клієнта
     */
    clearCache() {
        this.cache.clear()
    }

    /**
     * Повертає поточний вміст кешу для налагодження (debugging)
     */
    getCacheEntries() {
        const entries = {}
        for (const [key, value] of this.cache.entries()) {
            entries[key] = {
                endpoint: value.endpoint,
                timestamp: new Date(value.timestamp).toLocaleString(),
                expiresAt: new Date(value.expiresAt).toLocaleString(),
                isExpired: Date.now() > value.expiresAt,
            }
        }
        return entries
    }

    /**
     * Створює повністю детермінований ключ кешу незалежно від порядку параметрів/ключів
     * @private
     */
    _generateDeterministicKey(endpoint, options) {
        // 1. Нормалізуємо URL та Query-параметри за алфавітом
        let normalizedEndpoint = endpoint

        try {
            // Використовуємо фейковий базовий URL, щоб URL-парсер міг розібрати відносні шляхи
            const urlObj = new URL(endpoint, 'http://localhost')

            // Враховуємо query-параметри, які можуть передаватися в options.params або options.query
            const queryParams = options.params || options.query || {}
            for (const [key, value] of Object.entries(queryParams)) {
                if (value !== undefined && value !== null) {
                    if (Array.isArray(value)) {
                        value.forEach((val) => urlObj.searchParams.append(key, val))
                    } else {
                        urlObj.searchParams.append(key, value)
                    }
                }
            }

            if (urlObj.search) {
                // Сортуємо query-параметри за алфавітом ключа
                urlObj.searchParams.sort()
                // Зберігаємо лише чистий шлях із відсортованими параметрами
                normalizedEndpoint = urlObj.pathname + urlObj.search
            }
        } catch (err) {
            // Якщо endpoint не є валідним URL-компонентом, залишаємо його як є
            normalizedEndpoint = endpoint
        }

        // Нормалізуємо Body об'єкт (сортуємо ключі), захищаючи від FormData
        let normalizedBodyString = ''
        const body = options.body

        if (body && !(body instanceof (typeof FormData !== 'undefined' ? FormData : Object))) {
            let bodyObj = body
            if (typeof body === 'string') {
                try {
                    bodyObj = JSON.parse(body)
                } catch (err) {
                    bodyObj = body
                }
            }

            if (typeof bodyObj === 'object' && bodyObj !== null) {
                normalizedBodyString = JSON.stringify(this._sortObjectKeys(bodyObj))
            } else {
                normalizedBodyString = String(bodyObj)
            }
        }

        return `${normalizedEndpoint}_${normalizedBodyString}`
    }

    /**
     * Рекурсивно сортує ключі об'єкта за алфавітом
     * @private
     */
    _sortObjectKeys(obj) {
        if (typeof obj !== 'object' || obj === null) return obj
        if (Array.isArray(obj)) return obj.map((item) => this._sortObjectKeys(item))

        return Object.keys(obj)
            .sort()
            .reduce((acc, key) => {
                acc[key] = this._sortObjectKeys(obj[key])
                return acc
            }, {})
    }
}
