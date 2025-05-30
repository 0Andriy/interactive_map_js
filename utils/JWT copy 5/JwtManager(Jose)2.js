import { SignJWT, jwtVerify, decodeJwt, createRemoteJWKSet, importKey } from 'jose'
import fs from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import dotenv from 'dotenv'

// Завантажуємо змінні оточення на старті
dotenv.config()

/**
 * Генерує унікальний JWT ID (jti)
 * @returns {string} - унікальний JWT ID
 */
function generateJti() {
    return randomUUID()
}

/**
 * Клас для генерації, перевірки та управління JWT-токенами з підтримкою
 * асиметричних/симетричних алгоритмів, кешування, JWKS, валідації та Singleton патерну.
 */
class JwtManager {
    /** @private {JwtManager | null} Єдиний інстанс класу (для Singleton патерну). */
    static _instance = null

    /**
     * Створює або повертає існуючий інстанс JwtManager (Singleton).
     * @param {object} [userConfig={}] - Кастомна конфігурація токенів, що об'єднується з конфігурацією за замовчуванням.
     */
    constructor(userConfig = {}) {
        if (JwtManager._instance) {
            // Якщо інстанс вже існує, повертаємо його і не ініціалізуємо повторно.
            // Можемо також оновити конфігурацію, якщо це необхідно, але зазвичай singleton
            // ініціалізується один раз з фінальною конфігурацією.
            console.warn('JwtManager вже ініціалізовано. Повторне створення інстансу ігнорується.')
            return JwtManager._instance
        }
        JwtManager._instance = this

        /**
         * @private
         * @type {object} Конфігурація за замовчуванням для різних типів токенів.
         * Користувач може переоприділяти через userConfig.
         */
        this.defaultConfig = {
            tokenTypes: {
                access: {
                    algorithm: 'HS256', // Алгоритм підпису (HS256, RS256, ES256 тощо)
                    expiresIn: '15m', // Час життя токена (наприклад, '15m', '1h', '7d', або число секунд)
                    keySource: 'env', // Джерело ключа: 'env', 'file', 'db', 'jwks'
                    secretKey: 'ACCESS_TOKEN_SECRET', // Назва env змінної з секретом для HS-алгоритмів
                    privateKeyPath: null, // Шлях до файлу з приватним ключем (для RS/ES)
                    publicKeyPath: null, // Шлях до файлу з публічним ключем (для RS/ES)
                    jwksUri: null, // URL для отримання публічного ключа для валідації (для 'jwks' джерела)
                    keyId: null, // ID ключа, який буде переданий до функції 'loader' (для 'db' джерела)
                    cacheTTL: 5 * 60 * 1000, // Час кешування ключа в мс (5 хвилин)
                    loader: async (keyIdentifier) => {
                        // Заглушка для завантаження ключів з бази даних.
                        // Повинна повертати об'єкт з ключами в форматі, який розуміє jose (наприклад, { key: Buffer, publicKey: string } або { privateKey: string, publicKey: string })
                        // Приклад: return { key: 'ваш_секрет_з_БД' }; або { privateKey: 'PEM_приватний_ключ', publicKey: 'PEM_публічний_ключ' }
                        console.warn(
                            `DB loader for ${keyIdentifier} is not implemented. Returning dummy keys.`,
                        )
                        return { key: Buffer.from('dummy_db_secret', 'utf-8') }
                    },
                    generateJti: true, // Чи генерувати jti (JWT ID) автоматично
                    kid: null, // kid (Key ID) для заголовка токена (опціонально)
                    payloadValidator: null, // callback-функція для додаткової валідації payload (async (payload) => { return { isValid: boolean, errors?: string[] } })
                    allowNoExpiration: false, // Чи дозволяти токену бути без терміну дії (без 'exp' клейму)
                },
                refresh: {
                    algorithm: 'HS256',
                    expiresIn: '12h',
                    keySource: 'env',
                    secretKey: 'REFRESH_TOKEN_SECRET',
                    privateKeyPath: null,
                    publicKeyPath: null,
                    jwksUri: null,
                    keyId: null,
                    cacheTTL: 5 * 60 * 1000,
                    loader: async (keyIdentifier) => {
                        console.warn(
                            `DB loader for ${keyIdentifier} is not implemented. Returning dummy keys.`,
                        )
                        return { key: Buffer.from('dummy_db_refresh_secret', 'utf-8') }
                    },
                    generateJti: true,
                    kid: null,
                    payloadValidator: null,
                    allowNoExpiration: false,
                },
                apiKey: {
                    algorithm: 'HS256',
                    expiresIn: null, // API ключі часто без терміну дії
                    keySource: 'env',
                    secretKey: 'API_KEY_SECRET',
                    privateKeyPath: null,
                    publicKeyPath: null,
                    jwksUri: null,
                    keyId: null,
                    cacheTTL: 5 * 60 * 1000,
                    loader: async (keyIdentifier) => {
                        console.warn(
                            `DB loader for ${keyIdentifier} is not implemented. Returning dummy keys.`,
                        )
                        return { key: Buffer.from('dummy_db_api_secret', 'utf-8') }
                    },
                    generateJti: false, // API ключі рідко потребують JTI
                    kid: null,
                    payloadValidator: null,
                    allowNoExpiration: true,
                },
            },
        }

        /** @type {object} Об'єднана конфігурація (дефолтні + користувацькі). */
        this.config = this.mergeConfigs(this.defaultConfig, userConfig)

        /**
         * @private
         * @type {Map<string, {keys: object, cachedAt: number, ttlMs: number}>} Кеш завантажених ключів.
         * Ключ мапи - це `tokenType` (наприклад, 'access', 'refresh').
         */
        this.keyCache = new Map()

        /**
         * @private
         * @type {object} Об'єкт з функціями для завантаження ключів з різних джерел.
         */
        this.keyLoaders = {
            env: this.loadFromEnv.bind(this),
            file: this.loadFromFile.bind(this),
            jwks: this.loadFromJwks.bind(this),
            db: this.loadFromDb.bind(this),
        }

        /** @private {NodeJS.Timeout | null} Таймер для автооновлення ключів. */
        this._refreshInterval = null
    }

    /**
     * Повертає Singleton інстанс класу JwtManager.
     * Якщо інстанс ще не створений, він створюється з наданою конфігурацією.
     * @param {object} [userConfig={}] - Кастомна конфігурація токенів, що застосовується при першому створенні інстансу.
     * @returns {JwtManager} - Єдиний інстанс JwtManager.
     */
    static getInstance(userConfig = {}) {
        return JwtManager._instance || new JwtManager(userConfig)
    }

    /**
     * Глибоко об'єднує дві конфігурації, з пріоритетом для значень з `overrides`.
     * Особливо обробляє вкладений об'єкт `tokenTypes`.
     * @param {object} defaults - Об'єкт конфігурації за замовчуванням.
     * @param {object} overrides - Об'єкт конфігурації, що перевизначає дефолтні значення.
     * @returns {object} - Об'єднаний об'єкт конфігурації.
     */
    mergeConfigs(defaults, overrides) {
        const merged = { ...defaults, tokenTypes: { ...defaults.tokenTypes } }
        for (const tokenType in overrides.tokenTypes || {}) {
            if (Object.prototype.hasOwnProperty.call(overrides.tokenTypes, tokenType)) {
                merged.tokenTypes[tokenType] = {
                    ...defaults.tokenTypes[tokenType], // Зберігаємо дефолтні налаштування для цього типу токена
                    ...overrides.tokenTypes[tokenType], // Перезаписуємо їх кастомними
                }
            }
        }
        return merged
    }

    /** ----------- Методи завантаження ключів ----------- */

    /**
     * Завантажує ключ з environment змінної.
     * Для HS-алгоритмів повертає `Buffer` (RAW ключ).
     * Для RS/ES-алгоритмів очікує JWK-рядок або об'єкт.
     * @param {object} cfg - Конфігурація для типу токена.
     * @returns {Promise<{key?: Uint8Array | CryptoKey, privateKey?: string, publicKey?: string}>} - Об'єкт з ключами, імпортованими `jose`.
     * @throws {Error} Якщо змінна оточення не встановлена або ключ не може бути імпортований.
     */
    async loadFromEnv(cfg) {
        const secret = process.env[cfg.secretKey]
        if (!secret) {
            throw new Error(
                `Environment variable ${cfg.secretKey} for key source 'env' is not set.`,
            )
        }

        if (cfg.algorithm.startsWith('HS')) {
            // Для симетричних алгоритмів (HS256) очікуємо RAW Buffer.
            return { key: Buffer.from(secret, 'utf-8') }
        } else {
            // Для асиметричних алгоритмів (RS256, ES256) очікуємо JWK-рядок або об'єкт.
            // Припустимо, що в ENV може бути як приватний, так і публічний ключ.
            // Можна розширити, щоб читати окремо ACCESS_TOKEN_PRIVATE_KEY, ACCESS_TOKEN_PUBLIC_KEY
            const privateKey = process.env[`${cfg.secretKey}_PRIVATE`] || secret
            const publicKey = process.env[`${cfg.secretKey}_PUBLIC`] || privateKey // Публічний ключ може бути окремою змінною

            if (!privateKey)
                throw new Error(`Private key for ${cfg.secretKey} is not set in environment.`)
            if (!publicKey)
                throw new Error(`Public key for ${cfg.secretKey} is not set in environment.`)

            // importKey може працювати як з JWK, так і з PEM-рядками (залежить від jose версії та формату)
            return {
                privateKey: await importKey(privateKey, cfg.algorithm),
                publicKey: await importKey(publicKey, cfg.algorithm),
            }
        }
    }

    /**
     * Завантажує ключі з файлів (підтримка HS/RS/ES алгоритмів).
     * Для HS-алгоритмів очікує RAW ключ у файлі (один файл).
     * Для RS/ES-алгоритмів очікує PEM-кодовані приватний та публічний ключі у відповідних файлах.
     * @param {object} cfg - Конфігурація для типу токена.
     * @returns {Promise<{key?: Uint8Array | CryptoKey, privateKey?: CryptoKey, publicKey?: CryptoKey}>} - Об'єкт з ключами, імпортованими `jose`.
     * @throws {Error} Якщо шляхи до файлів не вказані, файли не знайдені або ключі не можуть бути імпортовані.
     */
    async loadFromFile(cfg) {
        if (cfg.algorithm.startsWith('HS')) {
            if (!cfg.secretKeyPath)
                throw new Error(
                    `'secretKeyPath' is required for 'file' keySource with HS algorithm.`,
                )
            const secret = await fs.readFile(
                path.resolve(process.cwd(), cfg.secretKeyPath),
                'utf-8',
            )
            // jose очікує Uint8Array для HS ключів, тому створюємо Buffer і перетворюємо його
            return { key: new Uint8Array(Buffer.from(secret.trim(), 'utf-8')) }
        } else {
            if (!cfg.privateKeyPath)
                throw new Error(
                    `'privateKeyPath' is required for 'file' keySource with RS/ES algorithm.`,
                )
            if (!cfg.publicKeyPath)
                throw new Error(
                    `'publicKeyPath' is required for 'file' keySource with RS/ES algorithm.`,
                )

            const privateKeyPEM = await fs.readFile(
                path.resolve(process.cwd(), cfg.privateKeyPath),
                'utf-8',
            )
            const publicKeyPEM = await fs.readFile(
                path.resolve(process.cwd(), cfg.publicKeyPath),
                'utf-8',
            )

            // importKey може імпортувати PEM-рядки
            const privateKey = await importKey(privateKeyPEM, cfg.algorithm)
            const publicKey = await importKey(publicKeyPEM, cfg.algorithm)

            return { privateKey, publicKey }
        }
    }

    /**
     * Завантажує ключі з бази даних (повинен приймати `loader`-функцію в конфігурації).
     * Функція `loader` повинна повертати об'єкт з ключами в форматі, який розуміє `jose`
     * (наприклад, { key: Buffer } для HS, або { privateKey: string, publicKey: string } для RS/ES).
     * Ці ключі потім будуть імпортовані `jose`.
     * @param {object} cfg - Конфігурація для типу токена.
     * @returns {Promise<object>} - Об'єкт з ключами, імпортованими `jose`.
     * @throws {Error} Якщо `loader` функція не надана або не вдалося завантажити ключі.
     */
    async loadFromDb(cfg) {
        if (typeof cfg.loader !== 'function') {
            throw new Error(`Missing 'loader' function in config for 'db' keySource of token type.`)
        }
        const rawKeys = await cfg.loader(cfg.keyId)

        if (cfg.algorithm.startsWith('HS')) {
            if (!rawKeys.key)
                throw new Error(`DB loader for HS algorithm must return a 'key' property.`)
            return { key: new Uint8Array(Buffer.from(rawKeys.key, 'utf-8')) }
        } else {
            if (!rawKeys.privateKey || !rawKeys.publicKey) {
                throw new Error(
                    `DB loader for RS/ES algorithm must return 'privateKey' and 'publicKey' properties.`,
                )
            }
            const privateKey = await importKey(rawKeys.privateKey, cfg.algorithm)
            const publicKey = await importKey(rawKeys.publicKey, cfg.algorithm)
            return { privateKey, publicKey }
        }
    }

    /**
     * Завантажує JWKS (JSON Web Key Set) ключі з URL.
     * Повертає функцію JWKS для використання в `jwtVerify`.
     * @param {object} cfg - Конфігурація для типу токена.
     * @returns {Promise<{JWKS: ReturnType<typeof createRemoteJWKSet>}>} - Об'єкт, що містить функцію JWKS.
     * @throws {Error} Якщо `jwksUri` не вказаний або URL недійсний.
     */
    async loadFromJwks(cfg) {
        if (!cfg.jwksUri) throw new Error(`'jwksUri' is required for 'jwks' keySource.`)
        try {
            const JWKS = createRemoteJWKSet(new URL(cfg.jwksUri))
            return { JWKS }
        } catch (error) {
            throw new Error(`Invalid JWKS URI: ${cfg.jwksUri}. Error: ${error.message}`)
        }
    }

    /** ----------- Кешування ключів ----------- */

    /**
     * Повертає ключі для заданого типу токена, використовуючи кеш.
     * Якщо ключі відсутні в кеші або їх TTL вичерпано, вони будуть завантажені заново.
     * @param {string} tokenType - Тип токена (наприклад, 'access', 'refresh').
     * @returns {Promise<object>} - Об'єкт з ключами (може містити `key`, `privateKey`, `publicKey`, `JWKS`).
     * @throws {Error} Якщо `tokenType` невідомий або не вдалося завантажити ключі.
     */
    async getKey(tokenType) {
        const cfg = this.config.tokenTypes[tokenType]
        if (!cfg) {
            throw new Error(`Unknown token type: ${tokenType}. Please define it in the config.`)
        }

        const cacheEntry = this.keyCache.get(tokenType)
        const now = Date.now()
        const ttl = cfg.cacheTTL

        // Перевіряємо кеш. Якщо дійсний, повертаємо.
        if (cacheEntry && now - cacheEntry.cachedAt < ttl) {
            return cacheEntry.keys
        }

        const loader = this.keyLoaders[cfg.keySource]
        if (!loader) {
            throw new Error(`No loader found for key source: ${cfg.keySource}.`)
        }

        console.log(
            `Завантажуємо ключі для типу токена '${tokenType}' з джерела '${cfg.keySource}'...`,
        )
        try {
            const keys = await loader(cfg)
            this.keyCache.set(tokenType, { keys, cachedAt: now, ttlMs: ttl })
            console.log(`Ключі для '${tokenType}' успішно завантажено та кешовано.`)
            return keys
        } catch (error) {
            console.error(
                `Помилка завантаження ключів для '${tokenType}' з джерела '${cfg.keySource}':`,
                error.message,
            )
            throw error // Перекидаємо помилку далі
        }
    }

    /**
     * Примусово оновлює ключі в кеші для одного типу токена або для всіх.
     * @param {string|null} [tokenType=null] - Тип токена для оновлення. Якщо null, оновлює всі.
     * @returns {Promise<object|object[]>} - Оновлені ключі або об'єкт з оновленими ключами для всіх типів.
     * @throws {Error} Якщо виникла помилка під час оновлення ключів.
     */
    async forceReload(tokenType = null) {
        if (tokenType) {
            this.keyCache.delete(tokenType) // Видаляємо з кешу, щоб примусово завантажити
            return this.getKey(tokenType)
        }

        const results = {}
        for (const type of Object.keys(this.config.tokenTypes)) {
            this.keyCache.delete(type)
            try {
                results[type] = await this.getKey(type)
            } catch (e) {
                console.error(`Помилка примусового оновлення ключів для '${type}':`, e.message)
                // Можна вирішити, чи потрібно перекидати помилку або просто логувати і продовжувати
                // Для надійності, можна перекидати помилку, якщо оновлення всіх ключів критично.
                // Наразі просто логуємо.
            }
        }
        return results
    }

    /**
     * Очищає кеш ключів для одного типу токена або повністю.
     * @param {string|null} [tokenType=null] - Тип токена, кеш якого потрібно очистити. Якщо null, очищає весь кеш.
     */
    clearCache(tokenType = null) {
        if (tokenType) {
            this.keyCache.delete(tokenType)
            console.log(`Кеш ключів для '${tokenType}' очищено.`)
        } else {
            this.keyCache.clear()
            console.log('Кеш ключів повністю очищено.')
        }
    }

    /** ----------- Підпис і перевірка токенів ----------- */

    /**
     * Створює підписаний JWT токен.
     * @param {object} payload - Дані для включення в payload токена.
     * @param {string} [tokenType='access'] - Тип токена, для якого застосовуються налаштування з конфігурації.
     * @param {object} [options={}] - Додаткові опції для підпису токена (наприклад, aud, iss, sub, expiresIn, jti, header, iat, nbf, exp).
     * @returns {Promise<string>} - Підписаний JWT токен.
     * @throws {Error} Якщо токен не може бути підписаний через відсутність ключів або неправильну конфігурацію.
     */
    async sign(payload, tokenType = 'access', options = {}) {
        const cfg = this.config.tokenTypes[tokenType]
        if (!cfg) {
            throw new Error(`Cannot sign token: Unknown token type '${tokenType}'.`)
        }

        const { key, privateKey } = await this.getKey(tokenType) // key для HS, privateKey для RS/ES

        // Вибір ключа для підпису в залежності від алгоритму
        let signKey
        if (cfg.algorithm.startsWith('HS')) {
            if (!key)
                throw new Error(
                    `Missing symmetric key for signing with algorithm ${cfg.algorithm}.`,
                )
            signKey = key
        } else {
            if (!privateKey)
                throw new Error(`Missing private key for signing with algorithm ${cfg.algorithm}.`)
            signKey = privateKey
        }

        // Ініціалізація JWT з payload
        const jwtSigner = new SignJWT({ ...payload })

        // Встановлення заголовків (header)
        const header = {
            alg: cfg.algorithm,
            ...(cfg.kid ? { kid: cfg.kid } : {}),
            ...(options.header || {}),
        }
        jwtSigner.setProtectedHeader(header)

        // Встановлюємо iat (час видачі)
        if (options.iat !== undefined) {
            jwtSigner.setIssuedAt(options.iat)
        } else {
            jwtSigner.setIssuedAt() // Автоматично ставить поточний час
        }

        // Встановлюємо exp (термін дії)
        // Пріоритет: options.exp > options.expiresIn (з парсингом) > cfg.expiresIn (з парсингом)
        if (options.exp !== undefined) {
            jwtSigner.setExpirationTime(options.exp)
        } else if (options.expiresIn !== undefined && options.expiresIn !== null) {
            const expiresInSeconds = this.parseExpiresIn(options.expiresIn)
            if (expiresInSeconds === null) {
                if (!cfg.allowNoExpiration)
                    throw new Error(`Invalid 'expiresIn' format or 'allowNoExpiration' is false.`)
            } else {
                jwtSigner.setExpirationTime(expiresInSeconds) // jose приймає число секунд
            }
        } else if (cfg.expiresIn !== undefined && cfg.expiresIn !== null) {
            const expiresInSeconds = this.parseExpiresIn(cfg.expiresIn)
            if (expiresInSeconds === null) {
                if (!cfg.allowNoExpiration)
                    throw new Error(
                        `Invalid 'expiresIn' format in config or 'allowNoExpiration' is false.`,
                    )
            } else {
                jwtSigner.setExpirationTime(expiresInSeconds)
            }
        } else if (!cfg.allowNoExpiration) {
            throw new Error(
                `'expiresIn' must be defined for token type '${tokenType}' unless 'allowNoExpiration' is true.`,
            )
        }

        // Встановлюємо nbf (not before)
        if (options.nbf !== undefined) {
            jwtSigner.setNotBefore(options.nbf)
        } else if (options.notBefore !== undefined) {
            // Підтримка альтернативного імені
            jwtSigner.setNotBefore(options.notBefore)
        }

        // Інші стандартні клейми: aud, iss, sub
        if (options.aud !== undefined) jwtSigner.setAudience(options.aud)
        if (options.iss !== undefined) jwtSigner.setIssuer(options.iss)
        if (options.sub !== undefined) jwtSigner.setSubject(options.sub)

        // jti (JWT ID): пріоритет - options.jwtid > options.jti > cfg.generateJti
        if (options.jwtid !== undefined) {
            jwtSigner.setJti(options.jwtid)
        } else if (options.jti !== undefined) {
            jwtSigner.setJti(options.jti)
        } else if (cfg.generateJti) {
            jwtSigner.setJti(generateJti())
        }

        return jwtSigner.sign(signKey)
    }

    /**
     * Перевіряє валідність JWT токена і повертає його payload.
     * @param {string} token - JWT токен для перевірки.
     * @param {string} [tokenType='access'] - Тип токена, для якого застосовуються налаштування конфігурації.
     * @returns {Promise<object>} - Розшифрований та валідований payload токена.
     * @throws {Error} Якщо токен недійсний (невірний підпис, протермінований, не пройшов валідацію payload тощо).
     */
    async verify(token, tokenType = 'access') {
        const cfg = this.config.tokenTypes[tokenType]
        if (!cfg) {
            throw new Error(`Cannot verify token: Unknown token type '${tokenType}'.`)
        }

        const { key, publicKey, JWKS } = await this.getKey(tokenType) // key для HS, publicKey для RS/ES, JWKS для JWKS source

        let result
        try {
            if (cfg.keySource === 'jwks') {
                if (!JWKS) throw new Error(`JWKS source selected, but JWKS function is not loaded.`)
                result = await jwtVerify(token, JWKS, { algorithms: [cfg.algorithm] })
            } else {
                let verifyKey
                if (cfg.algorithm.startsWith('HS')) {
                    if (!key)
                        throw new Error(
                            `Missing symmetric key for verification with algorithm ${cfg.algorithm}.`,
                        )
                    verifyKey = key
                } else {
                    if (!publicKey)
                        throw new Error(
                            `Missing public key for verification with algorithm ${cfg.algorithm}.`,
                        )
                    verifyKey = publicKey
                }
                result = await jwtVerify(token, verifyKey, { algorithms: [cfg.algorithm] })
            }
        } catch (err) {
            // Спеціальна обробка для токенів без терміну дії
            if (cfg.allowNoExpiration && err?.code === 'ERR_JWT_EXPIRED') {
                // Якщо токену дозволено бути без терміну дії, і це помилка протермінованості, ігноруємо її.
                // Це не стосується інших помилок валідації.
                console.warn(
                    `Token for type '${tokenType}' expired, but 'allowNoExpiration' is true. Skipping expiration check.`,
                )
                // Для отримання payload з протермінованого токена, можна декодувати його без перевірки.
                // Однак, стандартно verify викидає помилку, і це бажана поведінка для більшості токенів.
                // Якщо потрібен payload протермінованого токена, використовуйте decode() окремо.
                throw new Error(
                    `Token expired for type '${tokenType}', even though 'allowNoExpiration' is true. This should not happen if used correctly.`,
                )
            }
            // Перекидаємо інші помилки валідації
            throw new Error(`Token verification failed for type '${tokenType}': ${err.message}`)
        }

        // Додаткова валідація payload, якщо callback надано
        if (typeof cfg.payloadValidator === 'function') {
            const validationResult = await cfg.payloadValidator(result.payload) // Валідатор може бути асинхронним
            if (!validationResult || !validationResult.isValid) {
                const errors = validationResult?.errors?.join(', ') || 'unknown errors'
                throw new Error(`Payload validation failed for type '${tokenType}': ${errors}`)
            }
        }

        return result.payload
    }

    /**
     * Розшифровує JWT токен без перевірки підпису та інших клеймів.
     * Використовувати ОБЕРЕЖНО! Ця функція не перевіряє достовірність токена.
     * Призначена лише для швидкого отримання інформації з токена, коли його достовірність вже відома або не є критичною.
     * @param {string} token - JWT токен для декодування.
     * @returns {object | null} - Декодований payload токена, або null, якщо токен не є валідним JWT.
     */
    decode(token) {
        try {
            return decodeJwt(token)
        } catch (error) {
            console.error('Помилка декодування JWT токена:', error.message)
            return null
        }
    }

    /**
     * Розбирає строку з тривалістю (expiresIn) у секунди.
     * Підтримуються формати:
     * - число (вважається кількістю секунд)
     * - строка з числом і одиницею часу: 's' (секунди), 'm' (хвилини), 'h' (години), 'd' (дні)
     *
     * Приклади:
     * - '15m' => 900 (15 хвилин у секундах)
     * - '2h'  => 7200
     * - 30    => 30 (число, повертається як є)
     *
     * @param {string|number} str - Час у форматі рядка або число секунд.
     * @returns {number | null} Час у секундах, або null, якщо формат некоректний.
     */
    parseExpiresIn(str) {
        if (typeof str === 'number') return str
        if (typeof str !== 'string' || str.trim() === '') return null // Обробляємо порожні рядки

        const match = /^(\d+)([smhd])?$/.exec(str.trim())
        if (!match) {
            console.warn(`Некоректний формат expiresIn: '${str}'.`)
            return null // Повертаємо null при некоректному форматі
        }
        const value = parseInt(match[1], 10)
        const unit = match[2] || 's'
        const multipliers = { s: 1, m: 60, h: 3600, d: 86400 }

        if (!multipliers[unit]) {
            console.warn(`Невідома одиниця часу expiresIn: '${unit}' у '${str}'.`)
            return null
        }

        return value * multipliers[unit]
    }

    /** ----------- Автооновлення ключів ----------- */

    /**
     * Запускає автооновлення ключів для всіх типів токенів, які мають кеш.
     * Перевіряє, чи не вичерпався TTL кешу для кожного типу токена.
     * @param {number} [intervalMs=60000] - Інтервал перевірки та оновлення в мілісекундах (за замовчуванням 1 хвилина).
     */
    startAutoRefresh(intervalMs = 60000) {
        if (this._refreshInterval) {
            console.warn('Автооновлення ключів вже запущено.')
            return
        }
        console.log(`Запускаємо автооновлення ключів з інтервалом ${intervalMs / 1000} секунд.`)

        this._refreshInterval = setInterval(async () => {
            for (const tokenType of Object.keys(this.config.tokenTypes)) {
                const cfg = this.config.tokenTypes[tokenType]
                const cacheEntry = this.keyCache.get(tokenType)
                const now = Date.now()

                // Якщо ключі ще не кешовані, або термін кешування закінчується (за 1 секунду до TTL)
                if (!cacheEntry || now - cacheEntry.cachedAt >= cfg.cacheTTL - 1000) {
                    try {
                        console.log(`Оновлюємо ключі для '${tokenType}'...`)
                        await this.forceReload(tokenType)
                        console.log(`Ключі для '${tokenType}' успішно оновлено.`)
                    } catch (e) {
                        console.error(`Помилка автооновлення ключів для '${tokenType}':`, e.message)
                    }
                }
            }
        }, intervalMs)
    }

    /**
     * Зупиняє процес автооновлення ключів.
     */
    stopAutoRefresh() {
        if (this._refreshInterval) {
            clearInterval(this._refreshInterval)
            this._refreshInterval = null
            console.log('Автооновлення ключів зупинено.')
        }
    }
}

export default JwtManager
