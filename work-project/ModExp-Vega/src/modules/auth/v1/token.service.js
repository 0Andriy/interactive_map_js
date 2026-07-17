import crypto from 'crypto'
import { v7 as uuidv7 } from 'uuid'

export class TokenService {
    constructor(jwtManager) {
        this.jwtManager = jwtManager
    }

    /**
     * Генерує унікальний ідентифікатор токена (UUIDv4)
     */
    generateJti() {
        // const id = crypto.randomUUID()
        const id = uuidv7()

        return id
    }

    /**
     * Хешує весь рядок JWT для безпечного збереження
     */
    hashToken(jwtString, algorithm = 'sha256') {
        return crypto.createHash(algorithm).update(jwtString).digest('hex')
    }

    /**
     * Генерація Access JWT
     * Повертає об'єкт { accessToken, jti } для зручної синхронізації з БД
     */
    async generateAccessToken(payload, options = {}, context = {}) {
        const accessService = this.jwtManager.use('access')

        // Гарантуємо наявність jti, якщо його не передали ззовні
        const jti = options.jti || this.generateJti()
        options.jti = jti

        const accessToken = await accessService.sign(payload, options, context)

        return { accessToken, jti }
    }

    /**
     * Генерація Refresh JWT
     * Використовує окремий сервіс 'refresh'
     * Повертає сам токен, його jti та точну дату закінчення (expiresAt)
     */
    async generateRefreshToken(payload, options = {}, context = {}) {
        const refreshService = this.jwtManager.use('refresh')

        const jti = options.jti || this.generateJti()
        options.jti = jti

        const refreshToken = await refreshService.sign(payload, options, context)

        // Верифікуємо/розкодуємо щойно створений токен, щоб дізнатися його точний технічний exp
        const decoded = await refreshService.verify(refreshToken)

        // Перетворюємо exp (timestamp в секундах, наприклад 1716382190) у JS Date об'єкт
        const expiresAt = new Date(decoded.payload.exp * 1000)

        return { refreshToken, jti, expiresAt }
    }

    /**
     * Верифікація Access JWT
     */
    async verifyAccessToken(token, options = {}) {
        const accessService = this.jwtManager.use('access')

        try {
            const { payload } = await accessService.verify(token, options)
            return payload
        } catch (error) {
            throw new Error('INVALID_ACCESS_TOKEN')
        }
    }

    /**
     * Верифікація Refresh JWT
     * (Криптографічна перевірка без БД)
     */
    async verifyRefreshToken(token, options = {}) {
        const refreshService = this.jwtManager.use('refresh')

        try {
            const { payload } = await refreshService.verify(token, options)
            return payload
        } catch (error) {
            throw new Error('INVALID_REFRESH_TOKEN')
        }
    }
}
