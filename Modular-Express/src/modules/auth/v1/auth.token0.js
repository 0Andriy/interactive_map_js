// auth.token.js
import jwt from 'jsonwebtoken'
import fs from 'fs'
import path from 'path'

/**
 * Клас для роботи з JSON Web Tokens.
 * Використовує асиметричне шифрування для підвищення безпеки.
 */
class TokenService {
    constructor() {
        // Шляхи до ключів (рекомендується зберігати поза коренем проекту)
        const keyPath = path.resolve(process.cwd(), 'keys')

        try {
            this.privateKey = fs.readFileSync(path.join(keyPath, 'private.key'), 'utf8')
            this.publicKey = fs.readFileSync(path.join(keyPath, 'public.key'), 'utf8')
        } catch (error) {
            throw new Error('Криптографічні ключі не знайдено. Перевірте папку /keys')
        }

        this.algorithm = 'RS256'
    }

    /**
     * Генерує новий Access Token
     * @param {Object} payload - Дані користувача (id, username, roles)
     * @param {string} expiresIn - Термін дії (наприклад, '1h', '7d')
     */
    generateToken(payload, expiresIn = '1h') {
        return jwt.sign(payload, this.privateKey, {
            algorithm: this.algorithm,
            expiresIn,
        })
    }

    /**
     * Перевіряє валідність токена за допомогою публічного ключа
     * @param {string} token
     * @returns {Object} Decoded payload
     */
    verifyToken(token) {
        try {
            return jwt.verify(token, this.publicKey, {
                algorithms: [this.algorithm],
            })
        } catch (error) {
            throw new Error('Недійсний або прострочений токен')
        }
    }

    /**
     * Повертає публічний ключ у форматі PEM
     */
    getPublicKey() {
        return this.publicKey
    }
}

export default TokenService
