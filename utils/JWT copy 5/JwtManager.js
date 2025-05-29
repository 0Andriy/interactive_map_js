import jwt from 'jsonwebtoken'
import fs from 'fs/promises'
import path from 'path'
import fetch from 'node-fetch'
import { JWK } from 'jose'
import { randomUUID } from 'crypto'

/**
 * Генерує унікальний JWT ID (jti)
 * @returns {string}
 */
function generateJti() {
    return randomUUID()
}

/**
 * Клас JwtManager для роботи з JWT токенами
 * Підтримує:
 * - Різні типи токенів з власними конфігураціями
 * - Різні алгоритми (симетричні та асиметричні)
 * - Джерела ключів: env, file, db, jwks
 * - Кешування ключів з TTL
 * - Підтримку kid і JWKS
 * - Валідацію payload через callback
 * - Асинхронні методи
 * - Singleton патерн (єдиний інстанс класу)
 */
class JwtManager {
    // Ініціалізація статичного поля _instance (Singleton)
    _instance = null

    /**
     * Створює або повертає існуючий інстанс JwtManager (Singleton)
     * @param {object} userConfig - Кастомна конфігурація
     */
    constructor(userConfig = {}) {
        // Виклик статичного методу
        JwtManager.getInstance(userConfig)

        /**
         * Конфігурація за замовчуванням.
         * Користувач може переоприділяти через userConfig
         */
        this.defaultConfig = {
            tokenTypes: {
                access: {
                    algorithm: 'HS256', // Алгоритм підпису
                    expiresIn: '15m', // Час життя токена
                    keySource: 'env', // Джерело ключа: env, file, db, jwks
                    secretKey: 'ACCESS_TOKEN_SECRET', // Назва env змінної з секретом
                    cacheTTL: 5 * 60 * 1000, // Час кешування ключа в мс
                    loader: async (keyId) => {}, // Функція для завантаження ключів з бази даних
                    generateJti: true, // Чи генерувати jti (JWT ID)
                    kid: null, // kid для підпису (опціонально)
                    payloadValidator: null, // callback для валідації payload
                },
                refresh: {
                    algorithm: 'HS256', // Алгоритм підпису
                    expiresIn: '12h', // Час життя токена
                    keySource: 'env', // Джерело ключа: env, file, db, jwks
                    secretKey: 'REFRESH_TOKEN_SECRET', // Назва env змінної з секретом
                    cacheTTL: 5 * 60 * 1000, // Час кешування ключа в мс
                    loader: async (keyId) => {}, // Функція для завантаження ключів з бази даних
                    generateJti: true, // Чи генерувати jti (JWT ID)
                    kid: null, // kid для підпису (опціонально)
                    payloadValidator: null, // callback для валідації payload
                },
            },
        }

        // Об'єднуємо дефолтну конфігурацію з користувацькою
        this.config = this.mergeConfigs(this.defaultConfig, userConfig)

        /**
         * Кеш ключів у форматі Map(tokenType => { keys, cachedAt, ttlMs })
         */
        this.keyCache = new Map()

        /**
         * Ідентифікатор інтервалу для автооновлення ключів
         * @type {NodeJS.Timeout|null}
         */
        this._refreshInterval = null

        /**
         * Словник методів завантаження ключів по типу джерела
         */
        this.keyLoaders = {
            env: this.loadFromEnv.bind(this),
            file: this.loadFromFile.bind(this),
            db: this.loadFromDb.bind(this),
            jwks: this.loadFromJwks.bind(this),
        }
    }

    /**
     * Статичний метод для отримання інстансу (Singleton)
     * @param {object} userConfig - Кастомна конфігурація
     * @returns {JwtManager}
     */
    static getInstance(userConfig = {}) {
        if (!JwtManager._instance) {
            // Зберігаємо інстанс для Singleton
            JwtManager._instance = new JwtManager(userConfig)
        }

        // Якщо інстанс вже існує — повертаємо його
        return JwtManager._instance
    }

    /**
     * Об'єднує дефолтну конфігурацію з користувацькою.
     * Глибоке злиття для tokenTypes.
     * @param {object} defaults
     * @param {object} overrides
     * @returns {object}
     */
    mergeConfigs(defaults, overrides) {
        const merged = { ...defaults, tokenTypes: { ...defaults.tokenTypes } }
        for (const tokenType in overrides.tokenTypes || {}) {
            merged.tokenTypes[tokenType] = {
                ...defaults.tokenTypes[tokenType],
                ...overrides.tokenTypes[tokenType],
            }
        }
        return merged
    }

    /**
     * Завантажує ключ з env змінної
     * @param {object} cfg - конфігурація токена
     * @returns {Promise<object>} { secret }
     */
    async loadFromEnv(cfg) {
        const secret = process.env[cfg.secretKey]
        if (!secret) throw new Error(`Env variable ${cfg.secretKey} is not set`)
        return { secret }
    }

    /**
     * Завантажує ключі з файлів (приватний і публічний)
     * @param {object} cfg
     * @returns {Promise<object>} { privateKey, publicKey } або { secret }
     */
    async loadFromFile(cfg) {
        if (cfg.algorithm.startsWith('RS') || cfg.algorithm.startsWith('ES')) {
            const privateKey = await fs.readFile(path.resolve(cfg.privateKeyPath), 'utf-8')
            const publicKey = await fs.readFile(path.resolve(cfg.publicKeyPath), 'utf-8')
            return { privateKey, publicKey }
        } else {
            const secret = await fs.readFile(path.resolve(cfg.secretKeyPath), 'utf-8')
            return { secret }
        }
    }

    /**
     * Завантажує ключі з бази даних (через кастомний loader)
     * @param {object} cfg
     * @returns {Promise<object>}
     */
    async loadFromDb(cfg) {
        if (typeof cfg.loader !== 'function') {
            throw new Error(`Missing loader() function for DB source`)
        }
        const keys = await cfg.loader(cfg.keyId)
        if (!keys || typeof keys !== 'object') {
            throw new Error(`loader() must return an object with keys`)
        }
        return keys
    }

    /**
     * Завантажує JWKS (список публічних ключів) з uri
     * @param {object} cfg
     * @returns {Promise<Array>} масив JWK ключів
     */
    async loadFromJwks(cfg) {
        const response = await fetch(cfg.jwksUri)
        if (!response.ok) throw new Error(`Failed to fetch JWKS: ${response.statusText}`)
        const jwks = await response.json()
        return jwks.keys
    }

    /**
     * Отримує ключі для заданого типу токена, враховуючи кеш
     * @param {string} tokenType
     * @returns {Promise<object|Array>} ключі для підпису/перевірки
     */
    async getKeys(tokenType) {
        const cfg = this.config.tokenTypes[tokenType]
        const now = Date.now()
        const cache = this.keyCache.get(tokenType)
        const ttl = cfg.cacheTTL ?? 5 * 60 * 1000

        if (cache && now - cache.cachedAt < ttl) {
            return cache.keys
        }

        const loader = this.keyLoaders[cfg.keySource]
        if (!loader) throw new Error(`No key loader found for source: ${cfg.keySource}`)

        const keys = await loader(cfg)

        this.keyCache.set(tokenType, {
            keys,
            cachedAt: now,
            ttlMs: ttl,
        })

        return keys
    }

    /**
     * Примусово оновлює кеш ключів для конкретного типу або для всіх
     * @param {string|null} tokenType - тип токена або null для всіх
     * @returns {Promise<object|object[]>} оновлені ключі
     */
    async forceReload(tokenType = null) {
        if (tokenType) {
            this.keyCache.delete(tokenType)
            return this.getKeys(tokenType)
        }

        const results = {}
        for (const type of Object.keys(this.config.tokenTypes)) {
            this.keyCache.delete(type)
            results[type] = await this.getKeys(type)
        }
        return results
    }

    /**
     * Очищає кеш ключів для конкретного типу або повністю
     * @param {string|null} tokenType
     */
    clearCache(tokenType = null) {
        if (tokenType) {
            this.keyCache.delete(tokenType)
        } else {
            this.keyCache.clear()
        }
    }

    /**
     * Підписує payload у JWT токен
     * @param {object} payload - Дані для підпису
     * @param {string} tokenType - Тип токена (з конфігурації)
     * @param {object} options - Кастомні опції (expiresIn, audience, issuer, jwtid, header тощо)
     * @returns {Promise<string>} - Підписаний токен
     */
    async sign(payload, tokenType = 'access', options = {}) {
        const cfg = this.config.tokenTypes[tokenType]
        const keys = await this.getKeys(tokenType)

        let key
        if (cfg.keySource === 'jwks') {
            if (!cfg.privateKey)
                throw new Error('privateKey must be set in config for signing with jwks')
            key = cfg.privateKey
        } else if (cfg.algorithm.startsWith('HS')) {
            key = keys.secret
        } else {
            key = keys.privateKey
        }

        // Опції для jwt.sign
        const allowedOptions = [
            'expiresIn',
            'notBefore',
            'audience',
            'issuer',
            'subject',
            'jwtid',
            'header',
        ]
        const jwtOptions = {}

        for (const opt of allowedOptions) {
            if (options[opt] !== undefined) {
                jwtOptions[opt] = options[opt]
            }
        }

        jwtOptions.algorithm = cfg.algorithm
        jwtOptions.expiresIn = jwtOptions.expiresIn ?? cfg.expiresIn

        // Генерація jti, якщо не передано і включено в конфіг
        if (!jwtOptions.jwtid && cfg.generateJti !== false) {
            jwtOptions.jwtid = generateJti()
        }

        jwtOptions.header = jwtOptions.header || {}
        if (!jwtOptions.header.kid && cfg.kid) {
            jwtOptions.header.kid = cfg.kid
        }

        return jwt.sign(payload, key, jwtOptions)
    }

    /**
     * Перевіряє JWT токен
     * @param {string} token - JWT токен
     * @param {string} tokenType - Тип токена (access, refresh тощо)
     * @returns {Promise<object>} - Розшифрований payload токена
     * @throws {Error} - Якщо токен недійсний або payload не валідний
     */
    async verify(token, tokenType = 'access') {
        const cfg = this.config.tokenTypes[tokenType]
        const keys = await this.getKeys(tokenType)

        const decoded = jwt.decode(token, { complete: true })
        if (!decoded) throw new Error('Invalid token')

        let key
        if (cfg.keySource === 'jwks') {
            // Визначаємо key за kid
            const kid = decoded.header.kid
            const jwk = keys.find((k) => k.kid === kid)
            if (!jwk) throw new Error(`Key with kid=${kid} not found`)
            key = JWK.asKey(jwk).toPEM()
        } else if (cfg.algorithm.startsWith('HS')) {
            key = keys.secret
        } else {
            key = keys.publicKey
        }

        // Перевірка токена
        const verified = jwt.verify(token, key, { algorithms: [cfg.algorithm] })

        // Виконуємо додаткову валідацію payload, якщо є
        if (typeof cfg.payloadValidator === 'function') {
            const result = cfg.payloadValidator(verified)
            if (!result.isValid) {
                throw new Error(`Payload validation failed: ${result.errors.join(', ')}`)
            }
        }

        return verified
    }

    /**
     * Розшифровує токен без перевірки підпису
     * @param {string} token - JWT токен
     * @returns {Promise<object|null>} - Об’єкт { header, payload } або null
     */
    async decode(token) {
        return jwt.decode(token, { complete: true })
    }

    /**
     * Запускає автоматичне оновлення кешу ключів за інтервалом
     * Перевіряє TTL кешу і оновлює ключі, якщо TTL спливає
     * @param {number} intervalMs - Інтервал у мілісекундах (за замовчуванням 60000 мс)
     */
    startAutoRefresh(intervalMs = 60000) {
        if (this._refreshInterval) return // Вже запущено
        this._refreshInterval = setInterval(async () => {
            for (const tokenType of Object.keys(this.config.tokenTypes)) {
                const cfg = this.config.tokenTypes[tokenType]
                const cache = this.keyCache.get(tokenType)
                const ttl = cfg.cacheTTL ?? 5 * 60 * 1000
                const now = Date.now()
                if (!cache || now - cache.cachedAt >= ttl - 1000) {
                    try {
                        await this.forceReload(tokenType)
                    } catch (err) {
                        console.error(`Failed to refresh keys for tokenType ${tokenType}:`, err)
                    }
                }
            }
        }, intervalMs)
    }

    /**
     * Зупиняє автоматичне оновлення ключів
     */
    stopAutoRefresh() {
        clearInterval(this._refreshInterval)
        this._refreshInterval = null
    }
}

export default JwtManager
