import {
    SignJWT,
    jwtVerify,
    decodeJwt,
    createRemoteJWKSet,
    importJWK,
    importPKCS8,
    importSPKI,
} from 'jose'
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
                    expiresIn: '15m', // Час життя токена (наприклад, '15m', '1h', '7d', або число секунд). Може бути null.
                    keySource: 'env', // Джерело ключа: 'env', 'file', 'db', 'jwks'
                    secretKeyEnv: 'ACCESS_TOKEN_SECRET', // Назва env змінної з секретом для HS-алгоритмів (або префікс для RS/ES)
                    privateKeyPath: null, // Шлях до файлу з приватним ключем (для RS/ES)
                    publicKeyPath: null, // Шлях до файлу з публічним ключем (для RS/ES)
                    jwksUri: null, // URL для отримання публічного ключа для валідації (для 'jwks' джерела)
                    keyIdentifier: null, // ID ключа, який буде переданий до функції 'loader' (для 'db' джерела)
                    cacheTTL: 5 * 60 * 1000, // Час кешування ключа в мс (5 хвилин)
                    loader: async (keyId) => {
                        console.warn(
                            `DB loader for key identifier '${keyId}' is not implemented. Returning dummy keys.`,
                        )
                        // Приклад для HS:
                        // return { key: 'ваш_справжній_секрет_з_БД' };
                        // Приклад для RS/ES (PEM-кодовані ключі):
                        // return { privateKey: '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----', publicKey: '-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----' };
                        if (this.defaultConfig.tokenTypes.access.algorithm.startsWith('HS')) {
                            return { key: 'dummy_db_secret' }
                        } else {
                            return {
                                privateKey:
                                    '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDAXF2r9m4C6D9E\n...\n-----END PRIVATE KEY-----',
                                publicKey:
                                    '-----BEGIN PUBLIC KEY-----\nMIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAwFxdq/ZuAuhPRg290h2Z\n...\n-----END PUBLIC KEY-----',
                            }
                        }
                    },
                    generateJti: true, // Чи генерувати jti (JWT ID) автоматично
                    kid: null, // kid (Key ID) для заголовка токена (опціонально)
                    payloadValidator: null, // callback-функція для додаткової валідації payload (async (payload) => { return { isValid: boolean, errors?: string[] } })
                },
                refresh: {
                    algorithm: 'HS256',
                    expiresIn: '12h',
                    keySource: 'env',
                    secretKeyEnv: 'REFRESH_TOKEN_SECRET',
                    privateKeyPath: null,
                    publicKeyPath: null,
                    jwksUri: null,
                    keyIdentifier: null,
                    cacheTTL: 5 * 60 * 1000,
                    loader: async (keyId) => {
                        console.warn(
                            `DB loader for key identifier '${keyId}' is not implemented. Returning dummy keys.`,
                        )
                        if (this.defaultConfig.tokenTypes.refresh.algorithm.startsWith('HS')) {
                            return { key: 'dummy_db_refresh_secret' }
                        } else {
                            return {
                                privateKey:
                                    '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDAXF2r9m4C6D9E\n...\n-----END PRIVATE KEY-----',
                                publicKey:
                                    '-----BEGIN PUBLIC KEY-----\nMIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAwFxdq/ZuAuhPRg290h2Z\n...\n-----END PUBLIC KEY-----',
                            }
                        }
                    },
                    generateJti: true,
                    kid: null,
                    payloadValidator: null,
                },
                apiKey: {
                    algorithm: 'HS256',
                    expiresIn: null, // API ключі часто без терміну дії
                    keySource: 'env',
                    secretKeyEnv: 'API_KEY_SECRET',
                    privateKeyPath: null,
                    publicKeyPath: null,
                    jwksUri: null,
                    keyIdentifier: null,
                    cacheTTL: 5 * 60 * 1000,
                    loader: async (keyId) => {
                        console.warn(
                            `DB loader for key identifier '${keyId}' is not implemented. Returning dummy keys.`,
                        )
                        if (this.defaultConfig.tokenTypes.apiKey.algorithm.startsWith('HS')) {
                            return { key: 'dummy_db_api_secret' }
                        } else {
                            return {
                                privateKey:
                                    '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDAXF2r9m4C6D9E\n...\n-----END PRIVATE KEY-----',
                                publicKey:
                                    '-----BEGIN PUBLIC KEY-----\nMIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAwFxdq/ZuAuhPRg290h2Z\n...\n-----END PUBLIC KEY-----',
                            }
                        }
                    },
                    generateJti: false, // API ключі рідко потребують JTI
                    kid: null,
                    payloadValidator: null,
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
        /** @private {Map<string, Promise<object>>} Зберігає проміси завантаження ключів, щоб уникнути одночасного завантаження. */
        this._keyLoadingPromises = new Map()
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
     * Для HS-алгоритмів очікує RAW ключ у змінній.
     * Для RS/ES-алгоритмів очікує PEM-кодовані приватний та публічний ключі у відповідних змінних.
     * @param {object} cfg - Конфігурація для типу токена.
     * @returns {Promise<{key?: Uint8Array | CryptoKey, privateKey?: CryptoKey, publicKey?: CryptoKey}>} - Об'єкт з ключами, імпортованими `jose`.
     * @throws {Error} Якщо змінна оточення не встановлена або ключ не може бути імпортований.
     */
    async loadFromEnv(cfg) {
        const secret = process.env[cfg.secretKeyEnv]
        if (!secret) {
            throw new Error(
                `Environment variable ${cfg.secretKeyEnv} for key source 'env' is not set.`,
            )
        }

        if (cfg.algorithm.startsWith('HS')) {
            return { key: Buffer.from(secret, 'utf-8') }
        } else {
            const privateKeyEnvName = `${cfg.secretKeyEnv}_PRIVATE_KEY`
            const publicKeyEnvName = `${cfg.secretKeyEnv}_PUBLIC_KEY`

            const privateKeyPEM = process.env[privateKeyEnvName]
            const publicKeyPEM = process.env[publicKeyEnvName]

            if (!privateKeyPEM)
                throw new Error(`Private key environment variable ${privateKeyEnvName} is not set.`)
            if (!publicKeyPEM)
                throw new Error(`Public key environment variable ${publicKeyEnvName} is not set.`)

            const privateKey = await importPKCS8(privateKeyPEM, cfg.algorithm)
            const publicKey = await importSPKI(publicKeyPEM, cfg.algorithm)

            return { privateKey, publicKey }
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
            return { key: Buffer.from(secret.trim(), 'utf-8') }
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

            const privateKey = await importPKCS8(privateKeyPEM, cfg.algorithm)
            const publicKey = await importSPKI(publicKeyPEM, cfg.algorithm)

            return { privateKey, publicKey }
        }
    }

    /**
     * Завантажує ключі з бази даних (повинен приймати `loader`-функцію в конфігурації).
     * Функція `loader` повинна повертати об'єкт з ключами в форматі, який розуміє `jose`
     * (наприклад, { key: string } для HS, або { privateKey: string, publicKey: string } для RS/ES).
     * Ці ключі потім будуть імпортовані `jose`.
     * @param {object} cfg - Конфігурація для типу токена.
     * @returns {Promise<object>} - Об'єкт з ключами, імпортованими `jose`.
     * @throws {Error} Якщо `loader` функція не надана або не вдалося завантажити ключі.
     */
    async loadFromDb(cfg) {
        if (typeof cfg.loader !== 'function') {
            throw new Error(`Missing 'loader' function in config for 'db' keySource of token type.`)
        }
        const rawKeys = await cfg.loader(cfg.keyIdentifier)

        if (cfg.algorithm.startsWith('HS')) {
            if (!rawKeys.key)
                throw new Error(`DB loader for HS algorithm must return a 'key' property.`)
            return { key: Buffer.from(rawKeys.key, 'utf-8') }
        } else {
            if (!rawKeys.privateKey || !rawKeys.publicKey) {
                throw new Error(
                    `DB loader for RS/ES algorithm must return 'privateKey' and 'publicKey' properties.`,
                )
            }
            const privateKey = await importPKCS8(rawKeys.privateKey, cfg.algorithm)
            const publicKey = await importSPKI(rawKeys.publicKey, cfg.algorithm)
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
     * Використовує мапу `_keyLoadingPromises` для запобігання гонки при одночасному запиті на завантаження ключів.
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

        // Якщо вже є Promise для завантаження цих ключів, повертаємо його
        if (this._keyLoadingPromises.has(tokenType)) {
            console.log(`Ключі для '${tokenType}' вже завантажуються. Очікуємо завершення...`)
            return this._keyLoadingPromises.get(tokenType)
        }

        const loader = this.keyLoaders[cfg.keySource]
        if (!loader) {
            throw new Error(`No loader found for key source: ${cfg.keySource}.`)
        }

        console.log(
            `Завантажуємо ключі для типу токена '${tokenType}' з джерела '${cfg.keySource}'...`,
        )

        const loadingPromise = (async () => {
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
                this.keyCache.delete(tokenType) // Видаляємо з кешу, якщо завантаження не вдалося
                throw error // Перекидаємо помилку далі
            } finally {
                this._keyLoadingPromises.delete(tokenType) // Видаляємо проміс після завершення (успіху чи помилки)
            }
        })()

        this._keyLoadingPromises.set(tokenType, loadingPromise)
        return loadingPromise
    }

    /**
     * Примусово оновлює ключі в кеші для одного типу токена або для всіх.
     * @param {string|null} [tokenType=null] - Тип токена для оновлення. Якщо null, оновлює всі.
     * @returns {Promise<object|object[]>} - Оновлені ключі або об'єкт з оновленими ключами для всіх типів.
     * @throws {Error} Якщо виникла помилка під час оновлення ключів (тільки для конкретного tokenType).
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
                results[type] = { error: e.message } // Позначаємо помилку в результаті
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
     * `expiresIn` може бути у форматі "1h", "15m", "7d" або числом секунд.
     * @returns {Promise<string>} - Підписаний JWT токен.
     * @throws {Error} Якщо токен не може бути підписаний через відсутність ключів або неправильну конфігурацію.
     */
    async sign(payload, tokenType = 'access', options = {}) {
        const cfg = this.config.tokenTypes[tokenType]
        if (!cfg) {
            throw new Error(`Cannot sign token: Unknown token type '${tokenType}'.`)
        }

        const { key, privateKey } = await this.getKey(tokenType)

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

        const jwtSigner = new SignJWT({ ...payload })

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

        // Визначення кінцевого значення для терміну дії
        let finalExpiresIn =
            options.exp !== undefined
                ? options.exp
                : options.expiresIn !== undefined
                ? options.expiresIn
                : cfg.expiresIn

        if (finalExpiresIn !== null && finalExpiresIn !== undefined) {
            const expiresInSeconds = this.parseExpiresIn(finalExpiresIn)
            if (expiresInSeconds === null) {
                // Якщо parseExpiresIn повернув null, це означає некоректний формат
                throw new Error(
                    `Invalid 'expiresIn' format for token type '${tokenType}': ${finalExpiresIn}.`,
                )
            }
            jwtSigner.setExpirationTime(expiresInSeconds)
        }
        // Якщо finalExpiresIn був null або undefined, exp клейм просто не буде встановлено.

        if (options.nbf !== undefined) {
            jwtSigner.setNotBefore(options.nbf)
        } else if (options.notBefore !== undefined) {
            jwtSigner.setNotBefore(options.notBefore)
        }

        if (options.aud !== undefined) jwtSigner.setAudience(options.aud)
        if (options.iss !== undefined) jwtSigner.setIssuer(options.iss)
        if (options.sub !== undefined) jwtSigner.setSubject(options.sub)

        let jti = options.jwtid || options.jti
        if (jti === undefined && cfg.generateJti) {
            jti = generateJti()
        }
        if (jti !== undefined) {
            jwtSigner.setJti(jti)
        }

        return jwtSigner.sign(signKey)
    }

    /**
     * Перевіряє валідність JWT токена і повертає його payload.
     * @param {string} token - JWT токен для перевірки.
     * @param {string} [tokenType='access'] - Тип токена, для якого застосовуються налаштування конфігурації.
     * @param {object} [options={}] - Додаткові опції для перевірки токена (наприклад, audience, issuer, subject).
     * @returns {Promise<object>} - Розшифрований та валідований payload токена.
     * @throws {Error} Якщо токен недійсний (невірний підпис, протермінований, не пройшов валідацію payload тощо).
     */
    async verify(token, tokenType = 'access', options = {}) {
        const cfg = this.config.tokenTypes[tokenType]
        if (!cfg) {
            throw new Error(`Cannot verify token: Unknown token type '${tokenType}'.`)
        }

        const { key, publicKey, JWKS } = await this.getKey(tokenType)

        let result
        try {
            const verifyOptions = {
                algorithms: [cfg.algorithm],
                audience: options.aud,
                issuer: options.iss,
                subject: options.sub,
            }

            if (cfg.keySource === 'jwks') {
                if (!JWKS) throw new Error(`JWKS source selected, but JWKS function is not loaded.`)
                result = await jwtVerify(token, JWKS, verifyOptions)
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
                result = await jwtVerify(token, verifyKey, verifyOptions)
            }
        } catch (err) {
            let errorMessage = err.message
            if (err.code === 'ERR_JWT_EXPIRED') {
                errorMessage = 'Token has expired.'
            } else if (err.code === 'ERR_JWS_INVALID') {
                errorMessage = 'Invalid token signature.'
            } else if (err.code === 'ERR_JWT_NOT_YET_VALID') {
                errorMessage = 'Token is not yet valid.'
            }
            throw new Error(`Token verification failed for type '${tokenType}': ${errorMessage}`)
        }

        // Додаткова валідація payload, якщо callback надано
        if (typeof cfg.payloadValidator === 'function') {
            const validationResult = await cfg.payloadValidator(result.payload)
            if (!validationResult || !validationResult.isValid) {
                const errors = validationResult?.errors?.join(', ') || 'unknown validation errors'
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
     * @param {string|number|null|undefined} str - Час у форматі рядка, число секунд, null або undefined.
     * @returns {number | null} Час у секундах, або null, якщо формат некоректний, `str` null або undefined.
     */
    parseExpiresIn(str) {
        if (str === null || str === undefined) return null
        if (typeof str === 'number') return str
        if (typeof str !== 'string' || str.trim() === '') return null

        const match = /^(\d+)([smhd])?$/.exec(str.trim())
        if (!match) {
            console.warn(`Некоректний формат expiresIn: '${str}'.`)
            return null
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

                // Оновлюємо ключі, якщо вони ще не кешовані, або термін кешування закінчується
                // (оновлюємо за інтервал оновлення до закінчення TTL, щоб уникнути прострочених ключів)
                if (!cacheEntry || now - cacheEntry.cachedAt >= cfg.cacheTTL - intervalMs) {
                    try {
                        console.log(`Ініціюємо оновлення ключів для '${tokenType}'...`)
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
