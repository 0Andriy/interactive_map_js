import jwt from 'jsonwebtoken'
import { tokenConfigs } from './tokenConfig.js'

export class JwtService {
    constructor() {
        this.tokenConfigs = tokenConfigs
        this.secretCache = new Map() // кеш секретів { tokenType: { secret, expiresAt } }
    }

    // Імітація асинхронного отримання секрету з бази
    async _getSecretFromDB(tokenType) {
        // Тут може бути будь-який асинхронний код
        return new Promise((resolve) => {
            setTimeout(() => {
                // Повернемо для прикладу простий секрет
                resolve('db-secret-for-' + tokenType)
            }, 100)
        })
    }

    async _getSecret(tokenType, forVerify = false) {
        const now = Date.now()
        const cached = this.secretCache.get(tokenType)
        if (cached && cached.expiresAt > now) return cached.secret

        const config = this.tokenConfigs[tokenType]
        if (!config) throw new Error(`No config for token type "${tokenType}"`)

        let secret

        if (config.signOptions.algorithm.startsWith('HS')) {
            // Симетричний алгоритм — один секретний ключ
            if (config.source === 'db') {
                secret = await this._getSecretFromDB(tokenType)
            } else if (config.source === 'env') {
                secret = process.env[config.secretEnvKey]
                if (!secret) throw new Error(`Env secret ${config.secretEnvKey} not found`)
            }
        } else if (
            config.signOptions.algorithm.startsWith('RS') ||
            config.signOptions.algorithm.startsWith('ES')
        ) {
            // Асиметричний алгоритм — приватний/публічний ключі
            if (config.source !== 'env') throw new Error('Only env source supported for RS/ES')

            if (forVerify) {
                secret = process.env[config.publicKeyEnv]
                if (!secret) throw new Error(`Env public key ${config.publicKeyEnv} not found`)
            } else {
                secret = process.env[config.privateKeyEnv]
                if (!secret) throw new Error(`Env private key ${config.privateKeyEnv} not found`)
            }
        } else {
            throw new Error(`Unsupported algorithm: ${config.signOptions.algorithm}`)
        }

        const ttl = (config.cacheTTLSeconds ?? 600) * 1000
        this.secretCache.set(tokenType, { secret, expiresAt: now + ttl })
        return secret
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
