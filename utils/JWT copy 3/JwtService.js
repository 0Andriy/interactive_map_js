import fs from 'fs/promises'
import jwt from 'jsonwebtoken'
import { tokenConfigs } from './tokenConfig.js'

export class JwtService {
    constructor() {
        this.tokenConfigs = tokenConfigs
        this.secretCache = new Map() // { tokenType_keyType: { secret, expiresAt } }
    }

    // Читання ключа з файлу асинхронно
    async _readKeyFromFile(path) {
        try {
            const data = await fs.readFile(path, 'utf8')
            return data
        } catch (err) {
            throw new Error(`Failed to read key file ${path}: ${err.message}`)
        }
    }

    // Отримання секрету (секретний ключ / приватний / публічний)
    async _getSecret(tokenType, forVerify = false) {
        const now = Date.now()
        const cacheKey = tokenType + (forVerify ? '_verify' : '_sign')
        const cached = this.secretCache.get(cacheKey)
        if (cached && cached.expiresAt > now) return cached.secret

        const config = this.tokenConfigs[tokenType]
        if (!config) throw new Error(`No config for token type "${tokenType}"`)

        let secret

        if (config.signOptions.algorithm.startsWith('HS')) {
            // Симетричний секрет
            if (config.source === 'env') {
                secret = process.env[config.secretEnvKey]
                if (!secret) throw new Error(`Env secret ${config.secretEnvKey} not found`)
            } else {
                throw new Error(`Unsupported source "${config.source}" for HS algorithm`)
            }
        } else if (
            config.signOptions.algorithm.startsWith('RS') ||
            config.signOptions.algorithm.startsWith('ES')
        ) {
            if (config.source === 'file') {
                if (forVerify) {
                    if (!config.publicKeyFile) throw new Error('publicKeyFile not configured')
                    secret = await this._readKeyFromFile(config.publicKeyFile)
                } else {
                    if (!config.privateKeyFile) throw new Error('privateKeyFile not configured')
                    secret = await this._readKeyFromFile(config.privateKeyFile)
                }
            } else if (config.source === 'env') {
                secret = forVerify
                    ? process.env[config.publicKeyEnv]
                    : process.env[config.privateKeyEnv]
                if (!secret)
                    throw new Error(
                        `Env key not found for ${tokenType} ${forVerify ? 'public' : 'private'}`,
                    )
            } else {
                throw new Error(`Unsupported source "${config.source}" for RS/ES algorithm`)
            }
        } else {
            throw new Error(`Unsupported algorithm: ${config.signOptions.algorithm}`)
        }

        const ttl = (config.cacheTTLSeconds ?? 600) * 1000
        this.secretCache.set(cacheKey, { secret, expiresAt: now + ttl })

        return secret
    }

    // Метод для примусового оновлення ключів (очищення кешу + повторне читання)
    async refreshSecrets(tokenType) {
        this.secretCache.delete(tokenType + '_sign')
        this.secretCache.delete(tokenType + '_verify')

        // Примусово прочитаємо ключі і покладемо в кеш
        await this._getSecret(tokenType, false)
        await this._getSecret(tokenType, true)
    }

    async sign(payload, tokenType, options = {}) {
        const config = this.tokenConfigs[tokenType]
        if (!config) throw new Error(`No config for token type "${tokenType}"`)

        const secret = await this._getSecret(tokenType, false)

        const signOptions = {
            expiresIn: config.expiresIn,
            ...config.signOptions,
            ...options,
        }

        if (config.async) {
            return new Promise((resolve, reject) => {
                jwt.sign(payload, secret, signOptions, (err, token) => {
                    if (err) reject(err)
                    else resolve(token)
                })
            })
        } else {
            return jwt.sign(payload, secret, signOptions)
        }
    }

    async verify(token, tokenType, options = {}) {
        const config = this.tokenConfigs[tokenType]
        if (!config) throw new Error(`No config for token type "${tokenType}"`)

        const secret = await this._getSecret(tokenType, true)

        const verifyOptions = {
            ...config.verifyOptions,
            ...options,
        }

        if (config.async) {
            return new Promise((resolve, reject) => {
                jwt.verify(token, secret, verifyOptions, (err, decoded) => {
                    if (err) reject(err)
                    else resolve(decoded)
                })
            })
        } else {
            return jwt.verify(token, secret, verifyOptions)
        }
    }
}
