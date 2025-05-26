import jwt from 'jsonwebtoken'
import { tokenConfigs } from './tokenConfig.js'

export class JwtService {
    constructor() {
        this.tokenConfigs = tokenConfigs
        this.secretCache = new Map() // кеш секретів: { tokenType: { secret, expiresAt } }
    }

    // Імітація асинхронного отримання ключів з бази
    async _getSecretFromDB(tokenType, keyType) {
        // keyType = 'private' | 'public'
        // Тут реальний код повинен робити запит до БД і отримувати ключі
        // Приклад імітації:
        return new Promise((resolve) => {
            setTimeout(() => {
                if (tokenType === 'refresh' && keyType === 'private') {
                    resolve(`-----BEGIN PRIVATE KEY-----
MIIBVwIBADANBgkqhkiG9w0BAQEFAASCAT8wggE7AgEAAkEAx7lV9Kd9GzoVqR4z
...
-----END PRIVATE KEY-----`)
                } else if (tokenType === 'refresh' && keyType === 'public') {
                    resolve(`-----BEGIN PUBLIC KEY-----
MFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBAMe5VfSnfRs6FakcM6m6...
-----END PUBLIC KEY-----`)
                } else {
                    resolve(null)
                }
            }, 100)
        })
    }

    async _getSecret(tokenType, forVerify = false) {
        const now = Date.now()
        const cached = this.secretCache.get(tokenType + (forVerify ? '_verify' : '_sign'))
        if (cached && cached.expiresAt > now) return cached.secret

        const config = this.tokenConfigs[tokenType]
        if (!config) throw new Error(`No config for token type "${tokenType}"`)

        let secret

        if (config.signOptions.algorithm.startsWith('HS')) {
            // Симетричний: беремо секрет з env або БД
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
            if (config.source === 'db') {
                secret = await this._getSecretFromDB(tokenType, forVerify ? 'public' : 'private')
                if (!secret)
                    throw new Error(
                        `DB key not found for ${tokenType} ${forVerify ? 'public' : 'private'}`,
                    )
            } else if (config.source === 'env') {
                secret = forVerify
                    ? process.env[config.publicKeyEnv]
                    : process.env[config.privateKeyEnv]
                if (!secret)
                    throw new Error(
                        `Env key not found for ${tokenType} ${forVerify ? 'public' : 'private'}`,
                    )
            }
        } else {
            throw new Error(`Unsupported algorithm: ${config.signOptions.algorithm}`)
        }

        const ttl = (config.cacheTTLSeconds ?? 600) * 1000
        this.secretCache.set(tokenType + (forVerify ? '_verify' : '_sign'), {
            secret,
            expiresAt: now + ttl,
        })

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
