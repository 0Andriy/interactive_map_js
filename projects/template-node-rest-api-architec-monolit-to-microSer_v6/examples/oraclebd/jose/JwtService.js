import * as jose from 'jose'

/**
 * @typedef {Object} TokenOptions
 * @description Конфігурація для генерації та валідації токенів.
 * @property {string} [algorithm] - Алгоритм шифрування (напр. 'RS256', 'ES256', 'HS256').
 * @property {string|number} [expiresIn] - Час життя токена (напр. '1h', '24h', '7d').
 * @property {string} [issuer] - Емітент токена (поле 'iss').
 * @property {string} [audience] - Цільова аудиторія (поле 'aud').
 * @property {string} [subject] - Суб'єкт токена (поле 'sub', зазвичай ID користувача).
 * @property {string} [jwtId] - Унікальний ідентифікатор токена (поле 'jti').
 * @property {string|number} [notBefore] - Час, з якого токен стане активним (напр. '10h' для відкладеної дії).
 * @property {string} [kid] - Ідентифікатор ключа (Key ID) для пошуку в базі/сховищі.
 * @property {number} [clockSkewOffset] - Кількість секунд, на яку "відкочується" час створення (iat) назад.
 * @property {string|number} [clockTolerance] - Допустимий розсинхрон часу при перевірці (напр. '30s').
 * @property {Object} [customHeaders] - Додаткові користувацькі заголовки токена.
 */

/**
 * JwtService — обгортка над бібліотекою jose для роботи з JWT.
 * Забезпечує гнучке перемикання між сховищами ключів та компенсацію розсинхрону часу серверів.
 */
export class JwtService {
    /**
     * @param {Object} config - Об'єкт конфігурації DI.
     * @param {Function} config.keyResolver - Асинхронна функція для отримання ключа.
     * @param {TokenOptions} [config.defaultOptions] - Глобальні налаштування за замовчуванням.
     */
    constructor({ keyResolver, defaultOptions }) {
        // Зберігаємо функцію отримання ключів, передану через Dependency Injection
        this.keyResolver = keyResolver

        // Встановлюємо дефолтні значення, які будуть використані, якщо не передані специфічні
        this.defaultOptions = {
            algorithm: 'RS256',
            expiresIn: '1h',
            issuer: 'JwtService',
            clockSkewOffset: 5, // за замовчуванням 5 секунд зазору
            clockTolerance: '10s', // допуск розсинхрону при верифікації
            ...defaultOptions,
        }

        // Внутрішнє глобальне зміщення часу для корекції системного годинника
        this.internalTimeOffset = 0
    }

    /**
     * Встановлює глобальне коригування часу для всього екземпляра сервісу.
     * @param {number} [seconds=0] - Секунди (позитивні або негативні).
     */
    async setGlobalTimeOffset(seconds = 0) {
        this.internalTimeOffset = seconds
    }

    /**
     * Статичний метод для перетворення сирих даних (PEM рядок або об'єкт) у об'єкти jose.
     * @param {Object|string} keySource - Сирі дані (PEM рядки або об'єкт з секретом).
     * @param {string} alg - Алгоритм JWT.
     * @param {'sign'|'verify'} operation - Тип операції.
     * @returns {Promise<jose.KeyLike|Uint8Array>}
     * @example
     * const key = await JwtService.transformToJoseKey('PEM_DATA', 'RS256', 'sign');
     */
    static async transformToJoseKey(keySource, alg, operation) {
        // Якщо алгоритм симетричний (HS...), створюємо Uint8Array з секрету
        if (alg.startsWith('HS')) {
            const secret = keySource.secret || keySource
            return new TextEncoder().encode(secret)
        }

        // Для асиметричних алгоритмів (RS, ES, EdDSA)
        if (operation === 'sign') {
            // Для підпису використовуємо Private Key (формат PKCS8)
            const privatePem = keySource.private_key || keySource
            return await jose.importPKCS8(privatePem, alg)
        } else {
            // Для верифікації використовуємо Public Key (формат SPKI)
            const publicPem = keySource.public_key || keySource
            return await jose.importSPKI(publicPem, alg)
        }
    }

    /**
     * Генерує та підписує JWT токен.
     * @param {Object} payload - Корисне навантаження (Дані для токена).
     * @param {TokenOptions} [overrideOptions={}] - Специфічні налаштування виклику.
     * @returns {Promise<string>} Підписаний JWT.
     * @example
     * const token = await jwtService.sign({ role: 'admin' }, { expiresIn: '5m', kid: 'v1' });
     */
    async sign(payload, overrideOptions = {}) {
        // Об'єднуємо налаштування: пріоритет у overrideOptions
        const opt = { ...this.defaultOptions, ...overrideOptions }

        // Отримання ключа через ресолвер (DI)
        const key = await this.keyResolver({ alg: opt.algorithm, kid: opt.kid }, payload, 'sign')

        // Обчислення технічного часу випуску (iat) з урахуванням компенсації
        const now = Math.floor(Date.now() / 1000)
        const adjustedIat = now + this.internalTimeOffset - opt.clockSkewOffset

        const jwt = new jose.SignJWT(payload)

        // Встановлення захищених заголовків (Header)
        jwt.setProtectedHeader({
            alg: opt.algorithm,
            kid: opt.kid,
            typ: 'JWT',
            ...opt.customHeaders, // Можливість додати свої заголовки
        })

        // --- СТАНДАРТНІ ПАРАМЕТРИ (CLAIMS) ---

        // iat (Issued At): Час створення токена (встановлюється автоматично)
        jwt.setIssuedAt(adjustedIat)

        // exp (Expiration Time): Термін дії (наприклад, '2h', '7d', 3600)
        if (opt.expiresIn) jwt.setExpirationTime(opt.expiresIn)

        // iss (Issuer): Хто випустив токен
        if (opt.issuer) jwt.setIssuer(opt.issuer)

        // aud (Audience): Для кого призначений токен (рядок або масив рядків)
        if (opt.audience) jwt.setAudience(opt.audience)

        // sub (Subject): Ідентифікатор суб'єкта (наприклад, UUID користувача)
        if (opt.subject) jwt.setSubject(opt.subject)

        // nbf (Not Before): Токен не активний до цього часу
        if (opt.notBefore) {
            jwt.setNotBefore(opt.notBefore)
        } else {
            jwt.setNotBefore(adjustedIat)
        }

        // jti (JWT ID): Унікальний ID токена (для запобігання replay-атакам)
        if (opt.jwtId) jwt.setJti(opt.jwtId)

        return await jwt.sign(key)
    }

    /**
     * Верифікує токен та повертає його вміст.
     * @param {string} token - Рядок JWT.
     * @param {TokenOptions} [overrideOptions={}] - Опції верифікації.
     * @returns {Promise<{payload: Object, header: Object}>}
     */
    async verify(token, overrideOptions = {}) {
        const opt = { ...this.defaultOptions, ...overrideOptions }

        try {
            const { payload, protectedHeader } = await jose.jwtVerify(
                token,
                // Передаємо функцію, яка автоматично викличе наш ресолвер
                async (header, payload) => await this.keyResolver(header, payload, 'verify'),
                {
                    algorithms: [opt.algorithm],
                    issuer: opt.issuer,
                    audience: opt.audience,
                    subject: opt.subject,
                    clockTolerance: opt.clockTolerance, // Допуск на розбіжність годинників
                },
            )
            return { payload, header: protectedHeader }
        } catch (error) {
            throw new Error(`Token verification failed: ${error.message}`)
        }
    }

    /**
     * Швидке декодування payload без перевірки підпису.
     * @param {string} token - Рядок JWT.
     * @returns {Object}
     */
    decodePayload(token) {
        try {
            return jose.decodeJwt(token)
        } catch (error) {
            throw new Error(`Token decoding error: ${error.message}`)
        }
    }

    /**
     * Отримання заголовка без перевірки підпису (напр. для kid).
     * @param {string} token - Рядок JWT.
     * @returns {Object}
     */
    decodeHeader(token) {
        try {
            return jose.decodeProtectedHeader(token)
        } catch (error) {
            throw new Error(`Header decoding error: ${error.message}`)
        }
    }

    /**
     * Unsafe decoding of both header and payload without any validation.
     * @param {string} token - Рядок JWT.
     * @returns {Object}
     */
    decode(token) {
        try {
            return {
                payload: jose.decodeJwt(token),
                header: jose.decodeProtectedHeader(token),
            }
        } catch (error) {
            throw new Error(`Failed to perform complete JWT decode: ${error.message}`)
        }
    }

    /**
     * Генерує JWKS (набір публічних ключів) для надання іншим сервісам.
     * Використовує асинхронний цикл для послідовної обробки.
     *
     * @param {Array<Object>} dbKeys - Масив об'єктів ключів з бази даних.
     * @returns {Promise<{keys: Array<Object>}>} Набір ключів у форматі JSON.
     */
    async getPublicJwks(dbKeys) {
        const keys = []

        for (const keyData of dbKeys) {
            // const imported = await jose.importSPKI(keyData.public_key, keyData.algorithm)

            // Перетворюємо публічний ключ кожного запису
            const imported = await JwtService.transformToJoseKey(
                keyData,
                keyData.algorithm,
                'verify',
            )

            // Експортуємо у стандартний JSON формат (JWK)
            const jwk = await jose.exportJWK(imported)

            keys.push({
                ...jwk,
                kid: keyData.kid,
                alg: keyData.algorithm,
                use: 'sig',
            })
        }
        return { keys }
    }
}
