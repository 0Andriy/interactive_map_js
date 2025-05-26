import jwt from 'jsonwebtoken'
import { MongoClient } from 'mongodb'

class JwtService {
    constructor(tokenConfigs = {}, dbConfig = null) {
        this.tokenConfigs = tokenConfigs
        this.secretCache = new Map()
        this.db = null
        this.dbConfig = dbConfig

        if (dbConfig) {
            this._connectDB()
        }
    }

    async _connectDB() {
        try {
            const client = new MongoClient(this.dbConfig.uri, this.dbConfig.options)
            await client.connect()
            this.db = client.db(this.dbConfig.dbName)
            console.log('[JwtService] MongoDB connected')
        } catch (err) {
            console.error('[JwtService] MongoDB connection error:', err)
            throw err
        }
    }

    async _getSecretFromDB(tokenType) {
        if (!this.db) throw new Error('Database not connected')
        const doc = await this.db.collection('tokenSecrets').findOne({ tokenType })
        if (!doc) throw new Error(`Secret for token type "${tokenType}" not found in DB`)
        return doc.secret
    }

    async _getSecret(tokenType) {
        const now = Date.now()
        const cached = this.secretCache.get(tokenType)

        if (cached && cached.expiresAt > now) {
            return cached.secret
        }

        const config = this.tokenConfigs[tokenType]
        if (!config) throw new Error(`No config for token type "${tokenType}"`)

        let secret
        if (config.source === 'db') {
            secret = await this._getSecretFromDB(tokenType)
        } else if (config.source === 'env') {
            secret = process.env[config.secretEnvKey]
            if (!secret)
                throw new Error(
                    `Secret for token type "${tokenType}" not found in env variable ${config.secretEnvKey}`,
                )
        } else {
            throw new Error(`Unknown secret source "${config.source}"`)
        }

        const ttl = (config.cacheTTLSeconds ?? 600) * 1000

        this.secretCache.set(tokenType, {
            secret,
            expiresAt: now + ttl,
        })

        console.log(`[JwtService] Cached secret for tokenType="${tokenType}" for ${ttl / 1000}s`)

        return secret
    }

    async sign(payload, tokenType, options = {}) {
        const config = this.tokenConfigs[tokenType]
        if (!config) throw new Error(`No config for token type "${tokenType}"`)

        const secret = await this._getSecret(tokenType)

        const signOptions = {
            expiresIn: config.expiresIn,
            ...config.signOptions,
            ...options,
        }

        return new Promise((resolve, reject) => {
            jwt.sign(payload, secret, signOptions, (err, token) => {
                if (err) reject(err)
                else {
                    console.log(`[JwtService] Signed ${tokenType} token`)
                    resolve(token)
                }
            })
        })
    }

    async verify(token, tokenType, options = {}) {
        const config = this.tokenConfigs[tokenType]
        if (!config) throw new Error(`No config for token type "${tokenType}"`)

        const secret = await this._getSecret(tokenType)

        const verifyOptions = {
            ...config.verifyOptions,
            ...options,
        }

        return new Promise((resolve, reject) => {
            jwt.verify(token, secret, verifyOptions, (err, decoded) => {
                if (err) {
                    console.warn(`[JwtService] Failed verify ${tokenType} token:`, err.message)
                    reject(err)
                } else {
                    console.log(`[JwtService] Verified ${tokenType} token`)
                    resolve(decoded)
                }
            })
        })
    }

    decode(token) {
        return jwt.decode(token)
    }

    clearCache(tokenType) {
        if (tokenType) {
            this.secretCache.delete(tokenType)
            console.log(`[JwtService] Cleared cache for tokenType="${tokenType}"`)
        } else {
            this.secretCache.clear()
            console.log('[JwtService] Cleared all secret cache')
        }
    }
}

export default JwtService
