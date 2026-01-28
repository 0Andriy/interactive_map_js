// auth.token.js
import * as jose from 'jose'
import fs from 'fs/promises'
import path from 'path'

/**
 * Сервіс для роботи з токенами на базі бібліотеки jose.
 * Використовує асиметричні ключі RS256 та Web Crypto API.
 */
class TokenService {
    constructor() {
        this.keyPath = path.resolve(process.cwd(), 'keys')
        this.privateKey = null
        this.publicKey = null
        this.algorithm = 'RS256'
    }

    /**
     * Асинхронна ініціалізація ключів.
     * jose вимагає імпорту ключів у форматі KeyObject/CryptoKey.
     */
    async init() {
        try {
            const privatePem = await fs.readFile(path.join(this.keyPath, 'private.key'), 'utf8')
            const publicPem = await fs.readFile(path.join(this.keyPath, 'public.key'), 'utf8')

            // Імпортуємо ключі для використання в jose
            this.privateKey = await jose.importPKCS8(privatePem, this.algorithm)
            this.publicKey = await jose.importSPKI(publicPem, this.algorithm)
        } catch (error) {
            throw new Error(`Помилка ініціалізації ключів: ${error.message}`)
        }
    }

    /**
     * Генерує підписаний JWT (JWS)
     * @param {Object} payload
     * @param {string} expiresIn - наприклад, '1h'
     */
    async generateToken(payload, expiresIn = '1h') {
        return await new jose.SignJWT(payload)
            .setProtectedHeader({ alg: this.algorithm })
            .setIssuedAt()
            .setExpirationTime(expiresIn)
            .sign(this.privateKey)
    }

    /**
     * Валідація токена за допомогою публічного ключа
     */
    async verifyToken(token) {
        try {
            const { payload } = await jose.jwtVerify(token, this.publicKey, {
                algorithms: [this.algorithm],
            })
            return payload
        } catch (error) {
            throw new Error(`JWT Verification failed: ${error.message}`)
        }
    }

    /**
     * Повертає публічний ключ (наприклад, для JWKS endpoint)
     */
    getRawPublicKey() {
        // Повертаємо Pem-формат для зовнішніх споживачів
        return this.publicKey
    }

    /**
     * Генерує JWKS (JSON Web Key Set) для публічного ключа.
     * Використовується зовнішніми сервісами для автоматичної валідації.
     */
    async getJwks() {
        // Експортуємо CryptoKey у формат JSON Web Key
        const jwk = await jose.exportJWK(this.publicKey)

        return {
            keys: [
                {
                    ...jwk,
                    alg: this.algorithm,
                    use: 'sig', // призначення: signature
                    kid: 'main-auth-key', // Key ID для ідентифікації при ротації
                },
            ],
        }
    }
}

export default TokenService
