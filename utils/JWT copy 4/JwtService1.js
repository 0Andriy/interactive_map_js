import jwt from 'jsonwebtoken'
import fs from 'fs/promises'
import path from 'path'

class JWTService {
    constructor(userConfig = {}) {
        // Дефолтна конфігурація
        this.defaultConfig = {
            tokenTypes: {
                access: {
                    algorithm: 'HS256',
                    expiresIn: '15m',
                    keySource: 'env',
                    secretKey: 'ACCESS_TOKEN_SECRET',
                    cacheTTL: 5 * 60 * 1000, // 5 хв
                },
            },
        }

        this.config = this.mergeConfigs(this.defaultConfig, userConfig)

        // Кеш: Map<tokenType, { keys, cachedAt, ttlMs }>
        this.keyCache = new Map()

        // Обробники для кожного keySource
        this.keyLoaders = {
            env: this.loadFromEnv.bind(this),
            file: this.loadFromFile.bind(this),
            db: this.loadFromDb.bind(this),
        }
    }

    // Злиття дефолтної та користувацької конфігурації
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

    // Основний метод отримання ключів (з TTL перевіркою)
    async getKeys(tokenType) {
        const cfg = this.config.tokenTypes[tokenType]
        const now = Date.now()
        const cacheEntry = this.keyCache.get(tokenType)

        const ttl = cfg.cacheTTL ?? 5 * 60 * 1000

        if (cacheEntry && now - cacheEntry.cachedAt < ttl) {
            return cacheEntry.keys
        }

        const loader = this.keyLoaders[cfg.keySource]
        if (!loader) throw new Error(`Unknown keySource: ${cfg.keySource}`)

        const keys = await loader(cfg)

        this.keyCache.set(tokenType, {
            keys,
            cachedAt: now,
            ttlMs: ttl,
        })

        return keys
    }

    // Завантаження з ENV
    async loadFromEnv(cfg) {
        return { secret: process.env[cfg.secretKey] }
    }

    // Завантаження з файлів
    async loadFromFile(cfg) {
        if (cfg.algorithm.startsWith('RS') || cfg.algorithm.startsWith('ES')) {
            return {
                privateKey: await fs.readFile(path.resolve(cfg.privateKeyPath), 'utf-8'),
                publicKey: await fs.readFile(path.resolve(cfg.publicKeyPath), 'utf-8'),
            }
        } else {
            return {
                secret: await fs.readFile(path.resolve(cfg.secretKeyPath), 'utf-8'),
            }
        }
    }

    // Завантаження з БД або іншого джерела
    async loadFromDb(cfg) {
        if (typeof cfg.loader !== 'function') {
            throw new Error(`Missing loader() for DB source in token config`)
        }

        const result = await cfg.loader(cfg.keyId)

        if (!result || typeof result !== 'object') {
            throw new Error(`loader() must return { secret?, publicKey?, privateKey? }`)
        }

        return result
    }

    // Підписати токен
    async sign(payload, tokenType = 'access') {
        const cfg = this.config.tokenTypes[tokenType]
        const keys = await this.getKeys(tokenType)

        const key = cfg.algorithm.startsWith('HS') ? keys.secret : keys.privateKey

        return jwt.sign(payload, key, {
            algorithm: cfg.algorithm,
            expiresIn: cfg.expiresIn,
        })
    }

    // Перевірити токен
    async verify(token, tokenType = 'access') {
        const cfg = this.config.tokenTypes[tokenType]
        const keys = await this.getKeys(tokenType)

        const key = cfg.algorithm.startsWith('HS') ? keys.secret : keys.publicKey

        return jwt.verify(token, key, {
            algorithms: [cfg.algorithm],
        })
    }

    // Декодування без перевірки
    async decode(token) {
        return Promise.resolve(jwt.decode(token, { complete: true }))
    }

    // Примусово оновити ключі
    async forceReload(tokenType) {
        this.keyCache.delete(tokenType)
        return await this.getKeys(tokenType)
    }

    // Очистити кеш повністю або для конкретного типу
    async clearCache(tokenType = null) {
        if (tokenType) {
            this.keyCache.delete(tokenType)
        } else {
            this.keyCache.clear()
        }
    }
}

export default JWTService
