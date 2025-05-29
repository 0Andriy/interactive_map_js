import jwt from 'jsonwebtoken'
import fs from 'fs/promises'
import path from 'path'

class JwtManager {
    constructor(userConfig = {}) {
        this.defaultConfig = {
            tokenTypes: {
                access: {
                    algorithm: 'HS256',
                    expiresIn: '15m',
                    keySource: 'env',
                    secretKey: 'ACCESS_TOKEN_SECRET',
                    cacheTTL: 5 * 60 * 1000,
                },
            },
        }

        this.config = this.mergeConfigs(this.defaultConfig, userConfig)
        this.keyCache = new Map()

        this.keyLoaders = {
            env: this.loadFromEnv.bind(this),
            file: this.loadFromFile.bind(this),
            db: this.loadFromDb.bind(this),
        }

        this._refreshInterval = null
    }

    // === CONFIG ===
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

    // === LOADERS ===
    async loadFromEnv(cfg) {
        return { secret: process.env[cfg.secretKey] }
    }

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

    // === KEY MANAGEMENT ===
    async getKeys(tokenType) {
        const cfg = this.config.tokenTypes[tokenType]
        const now = Date.now()
        const cache = this.keyCache.get(tokenType)
        const ttl = cfg.cacheTTL ?? 5 * 60 * 1000

        if (cache && now - cache.cachedAt < ttl) {
            return cache.keys
        }

        const loader = this.keyLoaders[cfg.keySource]
        if (!loader) throw new Error(`Unknown keySource "${cfg.keySource}" for ${tokenType}`)

        const keys = await loader(cfg)

        this.keyCache.set(tokenType, {
            keys,
            cachedAt: now,
            ttlMs: ttl,
        })

        return keys
    }

    async forceReload(tokenType = null) {
        if (tokenType) {
            this.keyCache.delete(tokenType)
            return await this.getKeys(tokenType)
        }

        // Reload all
        const results = {}
        for (const type of Object.keys(this.config.tokenTypes)) {
            this.keyCache.delete(type)
            results[type] = await this.getKeys(type)
        }
        return results
    }

    async clearCache(tokenType = null) {
        if (tokenType) {
            this.keyCache.delete(tokenType)
        } else {
            this.keyCache.clear()
        }
    }

    // === TOKEN ACTIONS ===
    async sign(payload, tokenType = 'access') {
        const cfg = this.config.tokenTypes[tokenType]
        const keys = await this.getKeys(tokenType)

        const key = cfg.algorithm.startsWith('HS') ? keys.secret : keys.privateKey

        return jwt.sign(payload, key, {
            algorithm: cfg.algorithm,
            expiresIn: cfg.expiresIn,
        })
    }

    async verify(token, tokenType = 'access') {
        const cfg = this.config.tokenTypes[tokenType]
        const keys = await this.getKeys(tokenType)

        const key = cfg.algorithm.startsWith('HS') ? keys.secret : keys.publicKey

        return jwt.verify(token, key, {
            algorithms: [cfg.algorithm],
        })
    }

    async decode(token) {
        return Promise.resolve(jwt.decode(token, { complete: true }))
    }

    // === AUTO REFRESH ===
    startAutoRefresh(intervalMs = 60000) {
        if (this._refreshInterval) return

        this._refreshInterval = setInterval(async () => {
            const now = Date.now()
            for (const tokenType of Object.keys(this.config.tokenTypes)) {
                const cfg = this.config.tokenTypes[tokenType]
                const cache = this.keyCache.get(tokenType)
                const ttl = cfg.cacheTTL ?? 5 * 60 * 1000

                if (!cache || now - cache.cachedAt >= ttl - 1000) {
                    try {
                        await this.forceReload(tokenType)
                        console.log(`[JwtManager] Refreshed key for "${tokenType}"`)
                    } catch (err) {
                        console.error(`[JwtManager] Failed to refresh key for "${tokenType}":`, err)
                    }
                }
            }
        }, intervalMs)

        console.log(`[JwtManager] Auto-refresh started every ${intervalMs / 1000}s`)
    }

    stopAutoRefresh() {
        if (this._refreshInterval) {
            clearInterval(this._refreshInterval)
            this._refreshInterval = null
            console.log(`[JwtManager] Auto-refresh stopped`)
        }
    }
}

export default JwtManager
