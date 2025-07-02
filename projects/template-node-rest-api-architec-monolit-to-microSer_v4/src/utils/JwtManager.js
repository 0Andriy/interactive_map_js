import { SignJWT, jwtVerify, decodeJwt, createRemoteJWKSet, importPKCS8, importSPKI } from 'jose'
import fs from 'fs/promises' // Для асинхронної роботи з файловою системою
import path from 'path' // Для роботи зі шляхами файлів
import { randomUUID } from 'crypto' // Для генерації унікальних ID

/**
 * @typedef {Object} Logger
 * @property {(...args: any[]) => void} debug
 * @property {(...args: any[]) => void} info
 * @property {(...args: any[]) => void} warn
 * @property {(...args: any[]) => void} error
 */

/**
 * @typedef {'env' | 'file' | 'jwks' | 'db'} KeySource
 */

/**
 * @typedef {Object} TokenConfig
 * @property {string} algorithm - Алгоритм підпису JWT (наприклад, 'HS256', 'RS256', 'ES256').
 * @property {string | null} expiresIn - Час життя токена (наприклад, '15m', '12h', null для безстрокового).
 * @property {KeySource} keySource - Джерело, звідки завантажується ключ ('env', 'file', 'jwks', 'db').
 * @property {string | null} [secretKeyEnv] - Назва змінної оточення для симетричного ключа (для 'env').
 * @property {string | null} [privateKeyPath] - Шлях до файлу з приватним ключем (для 'file', асиметричні).
 * @property {string | null} [publicKeyPath] - Шлях до файлу з публічним ключем (для 'file', асиметричні).
 * @property {string | null} [jwksUri] - URI для JWKS (для 'jwks').
 * @property {string | null} [keyIdentifier] - Ідентифікатор ключа для завантаження з БД (для 'db').
 * @property {number} [cacheTTL] - Час кешування ключа в мілісекундах (за замовчуванням 5 хвилин).
 * @property {(keyId?: string) => Promise<{ key?: Uint8Array | string, privateKey?: string, publicKey?: string, JWKS?: import('jose').JWTVerifyGetKey }>} [loader] - Функція для завантаження ключа з БД (для 'db').
 * @property {boolean} [generateJti] - Генерувати унікальний JTI для токена.
 * @property {string | null} [kid] - Опціональний Key ID для заголовка токена.
 * @property {(payload: Record<string, any>) => Promise<{ isValid: boolean, errors?: string[] } | boolean>} [payloadValidator] - Функція для додаткової валідації payload токена.
 */

/**
 * @typedef {Object} JwtConfig
 * @property {{ [key: string]: TokenConfig }} tokenTypes - Об'єкт з конфігураціями для різних типів токенів.
 * @property {NodeJS.ProcessEnv} [envProvider] - Об'єкт, що надає доступ до змінних оточення (для тестування).
 * @property {{ readFile: (path: string, encoding: string) => Promise<string> }} [fileProvider] - Об'єкт, що надає доступ до файлової системи (для тестування).
 * @property {string} [cwd] - Поточний робочий каталог (для тестування шляхів до файлів).
 */

/**
 * Генерує унікальний ідентифікатор (JTI).
 * @returns {string} Унікальний UUID.
 */
function generateJti() {
    return randomUUID()
}

class JwtManager {
    static #instance = null

    /** @type {Logger} */
    static #defaultLogger = {
        debug: (...args) => console.debug(`[DEBUG][${new Date().toISOString()}]`, ...args),
        info: (...args) => console.log(`[INFO][${new Date().toISOString()}]`, ...args),
        warn: (...args) => console.log(`[WARN][${new Date().toISOString()}]`, ...args),
        error: (...args) => console.error(`[ERROR][${new Date().toISOString()}]`, ...args),
    }

    /** @type {{ [key: string]: TokenConfig }} */
    static #defaultTokenConfigs = {
        access: {
            algorithm: 'HS256',
            expiresIn: '15m',
            keySource: 'env',
            secretKeyEnv: 'ACCESS_TOKEN_SECRET',
            privateKeyPath: null,
            publicKeyPath: null,
            jwksUri: null,
            keyIdentifier: null,
            cacheTTL: 5 * 60 * 1000, // 5 хвилин
            loader: null, // Повинен бути реалізований користувачем для 'db' джерела
            generateJti: true,
            kid: null,
            payloadValidator: null,
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
            loader: null,
            generateJti: true,
            kid: null,
            payloadValidator: null,
        },
        apiKey: {
            algorithm: 'HS256',
            expiresIn: null, // API ключі зазвичай не мають терміну дії
            keySource: 'env',
            secretKeyEnv: 'API_KEY_SECRET',
            privateKeyPath: null,
            publicKeyPath: null,
            jwksUri: null,
            keyIdentifier: null,
            cacheTTL: 5 * 60 * 1000,
            loader: null,
            generateJti: false,
            kid: null,
            payloadValidator: null,
        },
    }

    /** @type {Logger} */
    #logger = JwtManager.#defaultLogger
    #isInitialized = false
    #initializingPromise = null
    /** @type {JwtConfig} */
    config = {}
    /** @type {Map<string, {keys: any, cachedAt: number, ttlMs: number}>} */
    keyCache = new Map()
    _refreshInterval = null
    /** @type {Map<string, Promise<any>>} */
    _keyLoadingPromises = new Map()

    /**
     * Приватний конструктор для реалізації Singleton.
     * @private
     */
    constructor() {
        if (JwtManager.#instance) {
            return JwtManager.#instance
        }
        JwtManager.#instance = this

        // keyLoaders ініціалізуються тут, оскільки вони залежать від `this`
        this.keyLoaders = {
            env: this.loadFromEnv.bind(this),
            file: this.loadFromFile.bind(this),
            jwks: this.loadFromJwks.bind(this),
            db: this.loadFromDb.bind(this),
        }
    }

    /**
     * Повертає єдиний екземпляр JwtManager.
     * @returns {JwtManager}
     */
    static getInstance(/*jwtConfig = {}, customLogger = null*/) {
        if (!JwtManager.#instance) {
            JwtManager.#instance = new JwtManager()
        }
        /*// Якщо ще не ініціалізовано, спробувати ініціалізувати
        if (!JwtManager.#instance.#isInitialized && jwtConfig && Object.keys(jwtConfig).length > 0) {
            JwtManager.#instance.initialize(jwtConfig, customLogger);
        }*/
        return JwtManager.#instance
    }

    /**
     * Ініціалізує JwtManager з наданою конфігурацією.
     * Цей метод можна викликати лише один раз. Подальші виклики будуть проігноровані.
     * @param {JwtConfig} jwtConfig - Об'єкт конфігурації JWT, що містить `tokenTypes`.
     * @param {Logger} [customLogger=null] - Опціональний кастомний об'єкт логера.
     * @returns {Promise<void>}
     * @throws {Error} Якщо `jwtConfig` або `jwtConfig.tokenTypes` відсутні.
     */
    async initialize(jwtConfig, customLogger = null) {
        if (this.#isInitialized) {
            this.#logger.info(
                'JwtManager вже ініціалізовано. Подальші виклики ініціалізації ігноруються.',
            )
            return
        }

        if (this.#initializingPromise) {
            this.#logger.debug(
                'JwtManager вже ініціалізується, очікування завершення існуючого процесу.',
            )
            return this.#initializingPromise
        }

        this.#initializingPromise = (async () => {
            this.#logger = customLogger || JwtManager.#defaultLogger
            this.#logger.info('Ініціалізація JwtManager...')

            if (!jwtConfig || !jwtConfig.tokenTypes) {
                throw new Error(
                    "Конфігурація JWT (jwtConfig.tokenTypes) обов'язкова для ініціалізації JwtManager.",
                )
            }

            this.config.tokenTypes = jwtConfig.tokenTypes
            this.config.envProvider = jwtConfig.envProvider || process.env
            this.config.fileProvider = jwtConfig.fileProvider || fs
            this.config.cwd = jwtConfig.cwd || process.cwd()

            this.#isInitialized = true
            this.#logger.info('Ініціалізація JwtManager завершена.')
        })()

        return this.#initializingPromise
    }

    /**
     * Об'єднує конфігурації, глибоко об'єднуючи `tokenTypes`.
     * @param {Object} defaults - Дефолтні налаштування.
     * @param {Object} overrides - Налаштування, що перевизначають дефолтні.
     * @returns {Object} Об'єднана конфігурація.
     */
    mergeConfigs(defaults, overrides) {
        const mergedTokenTypes = { ...defaults }
        for (const tokenType in overrides) {
            if (Object.prototype.hasOwnProperty.call(overrides, tokenType)) {
                mergedTokenTypes[tokenType] = {
                    ...defaults[tokenType],
                    ...overrides[tokenType],
                }
            }
        }
        return mergedTokenTypes
    }

    /**
     * Завантажує ключ зі змінних оточення.
     * @param {TokenConfig} cfg - Конфігурація токена.
     * @returns {Promise<{ key: Uint8Array } | { privateKey: import('jose').JWK, publicKey: import('jose').JWK }>} Об'єкт з ключами.
     * @throws {Error} Якщо змінна оточення не встановлена або ключі відсутні для асиметричних алгоритмів.
     */
    async loadFromEnv(cfg) {
        if (cfg.algorithm.startsWith('HS')) {
            const secret = this.config.envProvider[cfg.secretKeyEnv]
            if (!secret) {
                throw new Error(
                    `Змінна оточення '${cfg.secretKeyEnv}' для джерела ключа 'env' не встановлена.`,
                )
            }
            return { key: Buffer.from(secret, 'utf-8') }
        } else {
            const privateKeyEnvName = `${cfg.secretKeyEnv}_PRIVATE_KEY`
            const publicKeyEnvName = `${cfg.secretKeyEnv}_PUBLIC_KEY`

            const privateKeyPEM = this.config.envProvider[privateKeyEnvName]
            const publicKeyPEM = this.config.envProvider[publicKeyEnvName]

            if (!privateKeyPEM) {
                throw new Error(
                    `Приватний ключ у змінній оточення '${privateKeyEnvName}' не встановлений.`,
                )
            }
            if (!publicKeyPEM) {
                throw new Error(
                    `Публічний ключ у змінній оточення '${publicKeyEnvName}' не встановлений.`,
                )
            }

            const privateKey = await importPKCS8(privateKeyPEM, cfg.algorithm)
            const publicKey = await importSPKI(publicKeyPEM, cfg.algorithm)
            return { privateKey, publicKey }
        }
    }

    /**
     * Завантажує ключ з файлу.
     * @param {TokenConfig} cfg - Конфігурація токена.
     * @returns {Promise<{ key: Uint8Array } | { privateKey: import('jose').JWK, publicKey: import('jose').JWK }>} Об'єкт з ключами.
     * @throws {Error} Якщо шляхи до файлів відсутні або файли не можуть бути прочитані.
     */
    async loadFromFile(cfg) {
        if (cfg.algorithm.startsWith('HS')) {
            if (!cfg.secretKeyPath) {
                throw new Error(
                    `'secretKeyPath' обов'язковий для джерела ключа 'file' з алгоритмом HS.`,
                )
            }
            const secret = await this.config.fileProvider.readFile(
                path.resolve(this.config.cwd, cfg.secretKeyPath),
                'utf-8',
            )
            return { key: Buffer.from(secret.trim(), 'utf-8') }
        } else {
            if (!cfg.privateKeyPath) {
                throw new Error(
                    `'privateKeyPath' обов'язковий для джерела ключа 'file' з асиметричним алгоритмом.`,
                )
            }
            if (!cfg.publicKeyPath) {
                throw new Error(
                    `'publicKeyPath' обов'язковий для джерела ключа 'file' з асиметричним алгоритмом.`,
                )
            }

            const privateKeyPEM = await this.config.fileProvider.readFile(
                path.resolve(this.config.cwd, cfg.privateKeyPath),
                'utf-8',
            )
            const publicKeyPEM = await this.config.fileProvider.readFile(
                path.resolve(this.config.cwd, cfg.publicKeyPath),
                'utf-8',
            )

            const privateKey = await importPKCS8(privateKeyPEM, cfg.algorithm)
            const publicKey = await importSPKI(publicKeyPEM, cfg.algorithm)
            return { privateKey, publicKey }
        }
    }

    /**
     * Завантажує ключ з бази даних, використовуючи надану функцію `loader`.
     * @param {TokenConfig} cfg - Конфігурація токена.
     * @returns {Promise<{ key: Uint8Array } | { privateKey: import('jose').JWK, publicKey: import('jose').JWK }>} Об'єкт з ключами.
     * @throws {Error} Якщо функція `loader` відсутня або повертає некоректні ключі.
     */
    async loadFromDb(cfg) {
        if (typeof cfg.loader !== 'function') {
            throw new Error(
                `Відсутня функція 'loader' у конфігурації для джерела ключа 'db' типу токена.`,
            )
        }
        const rawKeys = await cfg.loader(cfg.keyIdentifier)

        if (cfg.algorithm.startsWith('HS')) {
            if (!rawKeys || !rawKeys.key) {
                throw new Error(`Лоадер БД для алгоритму HS має повертати властивість 'key'.`)
            }
            // Перевіряємо, чи ключ вже є Uint8Array. Якщо ні, конвертуємо з рядка.
            const key =
                typeof rawKeys.key === 'string' ? Buffer.from(rawKeys.key, 'utf-8') : rawKeys.key
            return { key }
        } else {
            if (!rawKeys || !rawKeys.privateKey || !rawKeys.publicKey) {
                throw new Error(
                    `Лоадер БД для асиметричного алгоритму має повертати властивості 'privateKey' та 'publicKey'.`,
                )
            }
            const privateKey = await importPKCS8(rawKeys.privateKey, cfg.algorithm)
            const publicKey = await importSPKI(rawKeys.publicKey, cfg.algorithm)
            return { privateKey, publicKey }
        }
    }

    /**
     * Завантажує ключі з віддаленого JWKS URI.
     * @param {TokenConfig} cfg - Конфігурація токена.
     * @returns {Promise<{ JWKS: import('jose').JWTVerifyGetKey }>} Об'єкт з функцією JWKS.
     * @throws {Error} Якщо `jwksUri` відсутній або некоректний.
     */
    async loadFromJwks(cfg) {
        if (!cfg.jwksUri) {
            throw new Error(`'jwksUri' обов'язковий для джерела ключа 'jwks'.`)
        }
        try {
            const JWKS = createRemoteJWKSet(new URL(cfg.jwksUri))
            return { JWKS }
        } catch (error) {
            throw new Error(`Некоректний JWKS URI: ${cfg.jwksUri}. Помилка: ${error.message}`)
        }
    }

    /**
     * Отримує ключі для заданого типу токена, використовуючи кеш або завантажуючи їх.
     * @param {string} tokenType - Тип токена (наприклад, 'access', 'refresh').
     * @returns {Promise<any>} Об'єкт з ключами.
     * @throws {Error} Якщо JwtManager не ініціалізовано, тип токена невідомий, або не знайдено завантажувач ключів.
     */
    async getKey(tokenType) {
        if (!this.#isInitialized) {
            throw new Error('JwtManager не ініціалізовано. Спершу викличте initialize().')
        }

        const cfg = this.config.tokenTypes[tokenType]
        if (!cfg) {
            throw new Error(
                `Невідомий тип токена: '${tokenType}'. Будь ласка, визначте його в конфігурації.`,
            )
        }

        const cacheEntry = this.keyCache.get(tokenType)
        const now = Date.now()
        const ttl = cfg.cacheTTL || 0 // Якщо cacheTTL не визначено, не кешувати (або встановити дефолт)

        // Перевіряємо кеш. Якщо ключі дійсні (не прострочені), повертаємо їх з кешу.
        if (cacheEntry && now - cacheEntry.cachedAt < ttl) {
            return cacheEntry.keys
        }

        // Якщо вже є активний проміс для завантаження цих ключів, повертаємо його.
        if (this._keyLoadingPromises.has(tokenType)) {
            this.#logger.info(`Ключі для '${tokenType}' вже завантажуються. Очікуємо завершення...`)
            return this._keyLoadingPromises.get(tokenType)
        }

        const loader = this.keyLoaders[cfg.keySource]
        if (!loader) {
            throw new Error(`Не знайдено завантажувача для джерела ключа: '${cfg.keySource}'.`)
        }

        this.#logger.info(
            `Завантажуємо ключі для типу токена '${tokenType}' з джерела '${cfg.keySource}'...`,
        )

        const loadingPromise = (async () => {
            try {
                const keys = await loader(cfg)
                this.keyCache.set(tokenType, { keys, cachedAt: now, ttlMs: ttl })
                this.#logger.info(`Ключі для '${tokenType}' успішно завантажено та кешовано.`)
                return keys
            } catch (error) {
                this.#logger.error(
                    `Помилка завантаження ключів для '${tokenType}' з джерела '${cfg.keySource}':`,
                    error.message,
                )
                this.keyCache.delete(tokenType) // Видаляємо запис з кешу в разі помилки.
                throw error
            } finally {
                this._keyLoadingPromises.delete(tokenType) // Видаляємо проміс після завершення.
            }
        })()

        this._keyLoadingPromises.set(tokenType, loadingPromise)
        return loadingPromise
    }

    /**
     * Примусово перезавантажує ключі для конкретного типу токена або для всіх.
     * @param {string | null} [tokenType=null] - Тип токена для перезавантаження. Якщо null, перезавантажує всі.
     * @returns {Promise<any>} Результати перезавантаження.
     */
    async forceReload(tokenType = null) {
        if (!this.#isInitialized) {
            throw new Error('JwtManager не ініціалізовано. Спершу викличте initialize().')
        }

        if (tokenType) {
            this.keyCache.delete(tokenType)
            this.#logger.info(`Примусове перезавантаження ключів для '${tokenType}'.`)
            return this.getKey(tokenType)
        }

        const results = {}
        for (const type of Object.keys(this.config.tokenTypes)) {
            this.keyCache.delete(type)
            this.#logger.info(`Примусове перезавантаження ключів для всіх типів: '${type}'.`)
            try {
                results[type] = await this.getKey(type)
            } catch (e) {
                this.#logger.error(`Помилка примусового оновлення ключів для '${type}':`, e.message)
                results[type] = { error: e.message }
            }
        }
        return results
    }

    /**
     * Очищає кеш ключів для конкретного типу токена або повністю.
     * @param {string | null} [tokenType=null] - Тип токена, для якого потрібно очистити кеш. Якщо null, очищає весь кеш.
     */
    clearCache(tokenType = null) {
        if (tokenType) {
            this.keyCache.delete(tokenType)
            this.#logger.info(`Кеш ключів для '${tokenType}' очищено.`)
        } else {
            this.keyCache.clear()
            this.#logger.info('Кеш ключів повністю очищено.')
        }
    }

    /**
     * Підписує JWT токен.
     * @param {Record<string, any>} payload - Payload токена.
     * @param {string} [tokenType='access'] - Тип токена.
     * @param {Object} [options={}] - Додаткові опції для підпису (exp, iat, nbf, aud, iss, sub, jti/jwtid, header).
     * @returns {Promise<string>} Підписаний JWT токен.
     * @throws {Error} Якщо JwtManager не ініціалізовано, тип токена невідомий, або відсутній необхідний ключ.
     */
    async sign(payload, tokenType = 'access', options = {}) {
        if (!this.#isInitialized) {
            throw new Error('JwtManager не ініціалізовано. Спершу викличте initialize().')
        }

        const cfg = this.config.tokenTypes[tokenType]
        if (!cfg) {
            throw new Error(`Неможливо підписати токен: Невідомий тип токена '${tokenType}'.`)
        }

        const { key, privateKey } = await this.getKey(tokenType)

        let signKey
        if (cfg.algorithm.startsWith('HS')) {
            if (!key) {
                throw new Error(
                    `Відсутній симетричний ключ для підпису з алгоритмом ${cfg.algorithm}.`,
                )
            }
            signKey = key
        } else {
            if (!privateKey) {
                throw new Error(
                    `Відсутній приватний ключ для підпису з алгоритмом ${cfg.algorithm}.`,
                )
            }
            signKey = privateKey
        }

        const jwtSigner = new SignJWT({ ...payload })

        const header = {
            alg: cfg.algorithm,
            ...(cfg.kid ? { kid: cfg.kid } : {}),
            ...(options.header || {}),
        }
        jwtSigner.setProtectedHeader(header)

        if (options.iat !== undefined) {
            jwtSigner.setIssuedAt(options.iat)
        } else {
            jwtSigner.setIssuedAt()
        }

        const finalExpiresIn = options.exp || options.expiresIn || cfg.expiresIn
        if (finalExpiresIn !== null && finalExpiresIn !== undefined) {
            jwtSigner.setExpirationTime(finalExpiresIn)
        }

        if (options.nbf !== undefined) {
            jwtSigner.setNotBefore(options.nbf)
        } else if (options.notBefore !== undefined) {
            // Додаткова перевірка для зворотньої сумісності
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
     * Верифікує JWT токен.
     * @param {string} token - JWT токен для верифікації.
     * @param {string} [tokenType='access'] - Тип токена.
     * @param {Object} [options={}] - Додаткові опції для верифікації (aud, iss, sub).
     * @returns {Promise<Record<string, any> | null>} Payload токена, якщо верифікація успішна, інакше null.
     * @throws {Error} Якщо JwtManager не ініціалізовано, тип токена невідомий, відсутній необхідний ключ, або валідація payload не пройшла.
     */
    async verify(token, tokenType = 'access', options = {}) {
        if (!this.#isInitialized) {
            throw new Error('JwtManager не ініціалізовано. Спершу викличте initialize().')
        }

        const cfg = this.config.tokenTypes[tokenType]
        if (!cfg) {
            throw new Error(`Неможливо верифікувати токен: Невідомий тип токена '${tokenType}'.`)
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
                if (!JWKS) throw new Error(`Джерело JWKS вибрано, але функція JWKS не завантажена.`)
                result = await jwtVerify(token, JWKS, verifyOptions)
            } else {
                let verifyKey
                if (cfg.algorithm.startsWith('HS')) {
                    if (!key) {
                        throw new Error(
                            `Відсутній симетричний ключ для верифікації з алгоритмом ${cfg.algorithm}.`,
                        )
                    }
                    verifyKey = key
                } else {
                    if (!publicKey) {
                        throw new Error(
                            `Відсутній публічний ключ для верифікації з алгоритмом ${cfg.algorithm}.`,
                        )
                    }
                    verifyKey = publicKey
                }
                result = await jwtVerify(token, verifyKey, verifyOptions)
            }
        } catch (err) {
            let errorMessage = err.message
            if (err.code === 'ERR_JWT_EXPIRED') {
                errorMessage = 'Термін дії токена минув.'
            } else if (err.code === 'ERR_JWS_INVALID') {
                errorMessage = 'Недійсний підпис токена.'
            } else if (err.code === 'ERR_JWT_NOT_YET_VALID') {
                errorMessage = 'Токен ще не дійсний.'
            }
            this.#logger.warn(
                `Верифікація токена не вдалася для типу '${tokenType}': ${errorMessage}`,
            )
            return null // Повертаємо null при помилці верифікації
        }

        if (typeof cfg.payloadValidator === 'function') {
            const validationResult = await cfg.payloadValidator(result.payload)
            if (
                !validationResult ||
                (typeof validationResult === 'object' && !validationResult.isValid)
            ) {
                const errors = validationResult?.errors?.join(', ') || 'невідомі помилки валідації'
                this.#logger.warn(`Валідація payload не вдалася для типу '${tokenType}': ${errors}`)
                return null // Повертаємо null, якщо валідація payload не пройшла
            }
        }

        return result.payload
    }

    /**
     * Декодує JWT токен без верифікації.
     * @param {string} token - JWT токен для декодування.
     * @returns {Record<string, any> | null} Декодований payload токена, або null, якщо декодування не вдалося.
     */
    decode(token) {
        try {
            return decodeJwt(token)
        } catch (error) {
            this.#logger.warn('Помилка декодування JWT токена:', error.message)
            return null
        }
    }

    /**
     * Парсить рядок тривалості (наприклад, '15m', '1h') у мілісекунди.
     * @param {string | number | null | undefined} str - Рядок або число для парсингу.
     * @returns {number | null} Тривалість у мілісекундах або null, якщо формат некоректний.
     */
    convertExpirationToMs(str) {
        // Обробка null або undefined вхідних даних
        if (str === null || str === undefined) {
            return null
        }
        // Якщо вхідні дані вже є числом, вважаємо, що це вже мілісекунди
        if (typeof str === 'number') {
            return str
        }
        // Якщо це не рядок або порожній рядок після обрізки пробілів, повертаємо null
        if (typeof str !== 'string' || str.trim() === '') {
            return null
        }

        // Регулярний вираз для парсингу формату "число[одиниця]"
        // ^(\d+): захоплює одну або більше цифр на початку рядка (це наше значення)
        // ([smhd])?: необов'язково захоплює одну з літер 's', 'm', 'h', 'd' (це наша одиниця)
        // $: кінець рядка
        const match = /^(\d+)([smhd])?$/.exec(str.trim())

        // Якщо рядок не відповідає очікуваному формату
        if (!match) {
            this.#logger.debug(`Некоректний формат expiresIn: '${str}'.`)
            return null
        }

        // Витягуємо числове значення з першої групи захоплення
        const value = parseInt(match[1], 10)
        // Витягуємо одиницю часу з другої групи захоплення, або 's' за замовчуванням
        const unit = match[2] || 's' // Якщо одиниця не вказана, за замовчуванням секунди

        // Визначаємо множники для перетворення в мілісекунди
        // Формули чіткіше показують, як розраховується кожне значення
        const multipliers = {
            s: 1000, // 1 секунда = 1000 мілісекунд
            m: 60 * 1000, // 1 хвилина = 60 секунд * 1000 мілісекунд/секунду
            h: 60 * 60 * 1000, // 1 година = 60 хвилин * 60 секунд/хвилину * 1000 мілісекунд/секунду
            d: 24 * 60 * 60 * 1000, // 1 день = 24 години * 60 хвилин/годину * 60 секунд/хвилину * 1000 мілісекунд/секунду
        }

        // Перевіряємо, чи є одиниця відомою
        if (!multipliers[unit]) {
            // Логуємо помилку, якщо одиниця невідома
            this.#logger.debug(`Невідома одиниця часу expiresIn: '${unit}' у '${str}'.`)
            return null
        }

        // Повертаємо обчислену тривалість у мілісекундах
        return value * multipliers[unit]
    }

    /**
     * Запускає автоматичне оновлення ключів з заданим інтервалом.
     * @param {number} [intervalMs=60000] - Інтервал оновлення ключів у мілісекундах (за замовчуванням 1 хвилина).
     * @throws {Error} Якщо JwtManager не ініціалізовано.
     */
    startAutoRefresh(intervalMs = 60000) {
        if (!this.#isInitialized) {
            throw new Error('JwtManager не ініціалізовано. Спершу викличте initialize().')
        }

        if (this._refreshInterval) {
            this.#logger.warn('Автооновлення ключів вже запущено.')
            return
        }
        this.#logger.info(
            `Запускаємо автооновлення ключів з інтервалом ${intervalMs / 1000} секунд.`,
        )

        this._refreshInterval = setInterval(async () => {
            for (const tokenType in this.config.tokenTypes) {
                if (Object.prototype.hasOwnProperty.call(this.config.tokenTypes, tokenType)) {
                    const cfg = this.config.tokenTypes[tokenType]
                    const cacheEntry = this.keyCache.get(tokenType)
                    const now = Date.now()
                    const ttl = cfg.cacheTTL || 0 // Використовуємо 0, якщо не визначено, щоб завжди оновлювати

                    // Ініціюємо оновлення, якщо кеш порожній або термін кешування закінчується.
                    // Оновлюємо, якщо до закінчення TTL лишається менше, ніж `intervalMs`.
                    if (!cacheEntry || now - cacheEntry.cachedAt >= ttl - intervalMs) {
                        try {
                            this.#logger.info(`Ініціюємо оновлення ключів для '${tokenType}'...`)
                            await this.forceReload(tokenType)
                            this.#logger.info(`Ключі для '${tokenType}' успішно оновлено.`)
                        } catch (e) {
                            this.#logger.error(
                                `Помилка автооновлення ключів для '${tokenType}':`,
                                e.message,
                            )
                        }
                    }
                }
            }
        }, intervalMs)
    }

    /**
     * Зупиняє автоматичне оновлення ключів.
     */
    stopAutoRefresh() {
        if (this._refreshInterval) {
            clearInterval(this._refreshInterval)
            this._refreshInterval = null
            this.#logger.info('Автооновлення ключів зупинено.')
        }
    }
}

// Експортуємо єдиний екземпляр JwtManager.
// Його потрібно буде ініціалізувати окремим викликом initialize().
export default JwtManager.getInstance()
