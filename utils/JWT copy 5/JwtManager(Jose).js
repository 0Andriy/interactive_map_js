import { SignJWT, jwtVerify, decodeJwt, createRemoteJWKSet, importJWK } from 'jose'
import fs from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'

/**
 * Генерує унікальний JWT ID (jti)
 * @returns {string} - унікальний JWT ID
 */
function generateJti() {
    return randomUUID()
}

/**
 * Клас для генерації, перевірки та управління JWT-токенами з підтримкою
 * асиметричних/симетричних алгоритмів, кешування, JWKS, валідації та Singleton патерну.
 */
class JwtManager {
    static _instance = null

    /**
     * Створює або повертає існуючий інстанс JwtManager (Singleton)
     * @param {object} [userConfig={}] - Кастомна конфігурація токенів
     */
    constructor(userConfig = {}) {
        if (JwtManager._instance) return JwtManager._instance
        JwtManager._instance = this

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
                    keyId: null, // ID ключа для запиту до бази даних
                    privateKeyPath: null, //Шлях до файлу з приватним ключем
                    publicKeyPath: null, //Шлях до файлу з публічним ключем
                    jwksUri: null, //url для отримання публічного ключа для валідації
                    cacheTTL: 5 * 60 * 1000, // Час кешування ключа в мс
                    loader: async (keyId) => {
                        return { key, privateKey, publicKey }
                    }, // Функція для завантаження ключів з бази даних
                    generateJti: true, // Чи генерувати jti (JWT ID)
                    kid: null, // kid для підпису (опціонально)
                    payloadValidator: null, // callback для валідації payload
                    allowNoExpiration: false, // Чи може токен бути вічним
                },
                refresh: {
                    algorithm: 'HS256', // Алгоритм підпису
                    expiresIn: '12h', // Час життя токена
                    keySource: 'env', // Джерело ключа: env, file, db, jwks
                    secretKey: 'REFRESH_TOKEN_SECRET', // Назва env змінної з секретом
                    keyId: null, // ID ключа для запиту до бази даних
                    privateKeyPath: null, //Шлях до файлу з приватним ключем
                    publicKeyPath: null, //Шлях до файлу з публічним ключем
                    jwksUri: null, //url для отримання публічного ключа для валідації
                    cacheTTL: 5 * 60 * 1000, // Час кешування ключа в мс
                    loader: async (keyId) => {
                        return { key, privateKey, publicKey }
                    }, // Функція для завантаження ключів з бази даних
                    generateJti: true, // Чи генерувати jti (JWT ID)
                    kid: null, // kid для підпису (опціонально)
                    payloadValidator: null, // callback для валідації payload
                    allowNoExpiration: false, // Чи може токен бути вічним
                },
                apiKey: {
                    algorithm: 'HS256', // Алгоритм підпису
                    expiresIn: null, // Час життя токена
                    keySource: 'env', // Джерело ключа: env, file, db, jwks
                    secretKey: 'API_KEY_SECRET', // Назва env змінної з секретом
                    keyId: null, // ID ключа для запиту до бази даних
                    privateKeyPath: null, //Шлях до файлу з приватним ключем
                    publicKeyPath: null, //Шлях до файлу з публічним ключем
                    jwksUri: null, //url для отримання публічного ключа для валідації
                    cacheTTL: 5 * 60 * 1000, // Час кешування ключа в мс
                    loader: async (keyId) => {
                        return { key, privateKey, publicKey }
                    }, // Функція для завантаження ключів з бази даних
                    generateJti: true, // Чи генерувати jti (JWT ID)
                    kid: null, // kid для підпису (опціонально)
                    payloadValidator: null, // callback для валідації payload
                    allowNoExpiration: true, // Чи може токен бути вічним
                },
            },
        }

        /** @type {object} Об'єднана конфігурація (дефолтні + користувацькі) */
        this.config = this.mergeConfigs(this.defaultConfig, userConfig)

        /** @type {Map<string, {keys: object, cachedAt: number, ttlMs: number}>} Кеш ключів */
        this.keyCache = new Map()

        /** @type {object} Об'єкт з функціями для завантаження ключів */
        this.keyLoaders = {
            env: this.loadFromEnv.bind(this),
            file: this.loadFromFile.bind(this),
            jwks: this.loadFromJwks.bind(this),
            db: this.loadFromDb.bind(this),
        }

        /** @type {NodeJS.Timeout | null} Таймер автооновлення */
        this._refreshInterval = null
    }

    /**
     * Повертає Singleton інстанс класу
     * @param {object} [userConfig={}]
     * @returns {JwtManager}
     */
    static getInstance(userConfig = {}) {
        return JwtManager._instance || new JwtManager(userConfig)
    }

    /**
     * Об'єднує дві конфігурації, з пріоритетом для overrides
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

    /** ----------- Методи завантаження ключів ----------- */

    /**
     * Завантажує ключ з environment змінної
     * @param {object} cfg
     * @returns {Promise<{key: Buffer}>}
     */
    async loadFromEnv(cfg) {
        const secret = process.env[cfg.secretKey]
        if (!secret) throw new Error(`Env variable ${cfg.secretKey} not set`)
        return { key: Buffer.from(secret, 'utf-8') }
    }

    /**
     * Завантажує ключі з файлів (підтримка HS/RS алгоритмів)
     * @param {object} cfg
     * @returns {Promise<{key?: Buffer, privateKey?: string, publicKey?: string}>}
     */
    async loadFromFile(cfg) {
        if (cfg.algorithm.startsWith('HS')) {
            const secret = await fs.readFile(path.resolve(cfg.secretKeyPath), 'utf-8')
            return { key: Buffer.from(secret.trim(), 'utf-8') }
        } else {
            const privateKey = await fs.readFile(path.resolve(cfg.privateKeyPath), 'utf-8')
            const publicKey = await fs.readFile(path.resolve(cfg.publicKeyPath), 'utf-8')
            return { privateKey, publicKey }
        }
    }

    /**
     * Завантажує ключі з бази даних (повинен приймати loader-функцію)
     * @param {object} cfg
     * @returns {Promise<object>}
     */
    async loadFromDb(cfg) {
        if (typeof cfg.loader !== 'function') {
            throw new Error('Missing loader() for DB key source')
        }
        const keys = await cfg.loader(cfg.keyId)
        return keys
    }

    /**
     * Завантажує JWKS ключі з URI
     * @param {object} cfg
     * @returns {Promise<{JWKS: Function}>}
     */
    async loadFromJwks(cfg) {
        const JWKS = createRemoteJWKSet(new URL(cfg.jwksUri))
        return { JWKS }
    }

    /** ----------- Кешування ключів ----------- */

    /**
     * Повертає ключі для типу токена, з кешем
     * @param {string} tokenType
     * @returns {Promise<object>}
     */
    async getKey(tokenType) {
        const cfg = this.config.tokenTypes[tokenType]
        const cache = this.keyCache.get(tokenType)
        const now = Date.now()
        const ttl = cfg.cacheTTL

        if (cache && now - cache.cachedAt < ttl) {
            return cache.keys
        }

        const loader = this.keyLoaders[cfg.keySource]
        if (!loader) throw new Error(`Unknown key source: ${cfg.keySource}`)
        const keys = await loader(cfg)
        this.keyCache.set(tokenType, { keys, cachedAt: now, ttlMs: ttl })
        return keys
    }

    /**
     * Примусово оновлює ключі, для одного типу або для всіх
     * @param {string|null} tokenType
     * @returns {Promise<object|object[]>}
     */
    async forceReload(tokenType = null) {
        if (tokenType) {
            this.keyCache.delete(tokenType)
            return this.getKey(tokenType)
        }

        const results = {}
        for (const type of Object.keys(this.config.tokenTypes)) {
            this.keyCache.delete(type)
            results[type] = await this.getKey(type)
        }
        return results
    }

    /**
     * Очищає кеш ключів
     * @param {string|null} tokenType
     */
    clearCache(tokenType = null) {
        if (tokenType) this.keyCache.delete(tokenType)
        else this.keyCache.clear()
    }

    /** ----------- Підпис і перевірка токенів ----------- */

    /**
     * Створює підписаний JWT токен
     * @param {object} payload - Дані для токена
     * @param {string} [tokenType='access'] - Тип токена (з конфігурації)
     * @param {object} [options={}] - Додаткові опції (aud, iss, sub, expiresIn, jti, header, iat, nbf, exp, ...)
     * @returns {Promise<string>} - Підписаний JWT
     */
    async sign(payload, tokenType = 'access', options = {}) {
        const cfg = this.config.tokenTypes[tokenType]
        const { key, privateKey } = await this.getKey(tokenType)

        const alg = cfg.algorithm
        const signKey = alg.startsWith('HS') ? key : await importJWK(privateKey, alg)

        // Ініціалізація з payload
        const jwt = new SignJWT({ ...payload })

        // Встановлення заголовків (header)
        const header = { alg, ...(cfg.kid ? { kid: cfg.kid } : {}), ...(options.header || {}) }
        jwt.setProtectedHeader(header)

        // Встановлюємо iat (час видачі) або беремо з options
        if (options.iat !== undefined) {
            jwt.setIssuedAt(options.iat)
        } else {
            jwt.setIssuedAt() // автоматично ставить поточний час
        }

        // Встановлюємо exp
        if (options.exp !== undefined) {
            jwt.setExpirationTime(options.exp)
        } else if (options.expiresIn !== undefined) {
            jwt.setExpirationTime('' + (Math.floor(Date.now() / 1000) + Number(options.expiresIn)))
        } else if (cfg.expiresIn !== undefined && cfg.expiresIn !== null) {
            jwt.setExpirationTime('' + (Math.floor(Date.now() / 1000) + Number(cfg.expiresIn)))
        }

        // Встановлюємо notBefore
        if (options.nbf !== undefined) {
            jwt.setNotBefore(options.nbf)
        } else if (options.notBefore !== undefined) {
            jwt.setNotBefore(options.notBefore)
        }

        // Інші опції: aud, iss, sub, jti
        if (options.aud !== undefined) jwt.setAudience(options.aud)
        if (options.iss !== undefined) jwt.setIssuer(options.iss)
        if (options.sub !== undefined) jwt.setSubject(options.sub)

        // jti: пріоритет - options.jwtid > options.jti > cfg.generateJti
        if (options.jwtid !== undefined) {
            jwt.setJti(options.jwtid)
        } else if (options.jti !== undefined) {
            jwt.setJti(options.jti)
        } else if (cfg.generateJti) {
            jwt.setJti(generateJti())
        }

        return jwt.sign(signKey)
    }

    /**
     * Перевіряє валідність JWT токена і повертає payload
     * @param {string} token - JWT токен
     * @param {string} [tokenType='access'] - Тип токена
     * @returns {Promise<object>} - Розшифрований payload
     * @throws {Error} - Якщо токен не валідний
     */
    async verify(token, tokenType = 'access') {
        const cfg = this.config.tokenTypes[tokenType]
        const { key, publicKey, JWKS } = await this.getKey(tokenType)

        let result
        try {
            if (cfg.keySource === 'jwks') {
                result = await jwtVerify(token, JWKS, { algorithms: [cfg.algorithm] })
            } else {
                const verifyKey = cfg.algorithm.startsWith('HS')
                    ? key
                    : await importJWK(publicKey, cfg.algorithm)
                result = await jwtVerify(token, verifyKey, { algorithms: [cfg.algorithm] })
            }
        } catch (err) {
            if (!(cfg.allowNoExpiration && err?.code === 'ERR_JWT_EXPIRED')) {
                throw new Error(`Token verification failed: ${err.message}`)
            }
        }

        if (typeof cfg.payloadValidator === 'function') {
            const validation = cfg.payloadValidator(result.payload)
            if (!validation?.isValid) {
                throw new Error(`Payload validation failed: ${validation.errors?.join(', ')}`)
            }
        }

        return result.payload
    }

    /**
     * Розшифровує JWT без перевірки
     * @param {string} token - JWT токен
     * @returns {object} - Payload токена
     */
    async decode(token) {
        return decodeJwt(token)
    }

    /**
     * Розбирає строку з тривалістю (expiresIn) у секунди.
     * Підтримуються формати:
     * - число (вважається кількістю секунд)
     * - строка з числом і одиницею часу: 's' (секунди), 'm' (хвилини), 'h' (години), 'd' (дні)
     *
     * Приклади:
     * - '15m' => 900 (15 хвилин у секундах)
     * - '2h'  => 7200
     * - 30    => 30 (число, повертається як є)
     *
     * @param {string|number} str - Час у форматі рядка або число секунд
     * @returns {number} Час у секундах
     * @throws {Error} Якщо формат рядка некоректний
     */
    async parseExpiresIn(str) {
        if (typeof str === 'number') return str
        const match = /^(\d+)([smhd])?$/.exec(str)
        if (!match) throw new Error(`Invalid expiresIn format: ${str}`)
        const value = parseInt(match[1])
        const unit = match[2] || 's'
        const multipliers = { s: 1, m: 60, h: 3600, d: 86400 }
        return value * multipliers[unit]
    }
    /** ----------- Автооновлення ключів ----------- */

    /**
     * Запускає автооновлення ключів за інтервалом
     * @param {number} [intervalMs=60000] - Інтервал в мс
     */
    startAutoRefresh(intervalMs = 60000) {
        if (this._refreshInterval) return
        this._refreshInterval = setInterval(async () => {
            for (const tokenType of Object.keys(this.config.tokenTypes)) {
                const cfg = this.config.tokenTypes[tokenType]
                const cache = this.keyCache.get(tokenType)
                const now = Date.now()
                if (!cache || now - cache.cachedAt >= cfg.cacheTTL - 1000) {
                    try {
                        await this.forceReload(tokenType)
                    } catch (e) {
                        console.error(`Failed to refresh keys for ${tokenType}:`, e)
                    }
                }
            }
        }, intervalMs)
    }

    /**
     * Зупиняє автооновлення ключів
     */
    stopAutoRefresh() {
        clearInterval(this._refreshInterval)
        this._refreshInterval = null
    }
}

export default JwtManager
