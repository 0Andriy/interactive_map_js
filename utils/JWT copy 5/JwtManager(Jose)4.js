import { SignJWT, jwtVerify, decodeJwt, createRemoteJWKSet, importPKCS8, importSPKI } from 'jose' // Імпорт необхідних функцій з бібліотеки jose
import fs from 'fs/promises' // Для асинхронної роботи з файловою системою
import path from 'path' // Для роботи зі шляхами файлів
import { randomUUID } from 'crypto' // Для генерації унікальних ID
import dotenv from 'dotenv' // Для завантаження змінних оточення з файлу .env

// Завантажуємо змінні оточення на старті додатку.
// Це дозволяє конфігурувати секретні ключі та інші параметри через файл .env.
dotenv.config()

/**
 * Генерує унікальний ідентифікатор JWT (jti) за допомогою UUID v4.
 * Цей ідентифікатор допомагає запобігти повторним атакам та відстежувати унікальність токенів.
 * @returns {string} Унікальний JWT ID.
 */
function generateJti() {
    return randomUUID()
}

/**
 * @typedef {object} TokenConfig
 * @property {string} algorithm - Алгоритм підпису JWT (наприклад, 'HS256', 'RS256', 'ES256').
 * @property {string|number|null} expiresIn - Час життя токена. Може бути числом секунд,
 * рядком з одиницею часу (наприклад, '15m', '1h', '7d'), або `null` для токенів без терміну дії.
 * @property {'env'|'file'|'db'|'jwks'} keySource - Джерело, звідки завантажувати ключі.
 * @property {string} secretKeyEnv - Назва змінної оточення для симетричного ключа (HS-алгоритми)
 * або префікс для асиметричних ключів (RS/ES, наприклад, ACCESS_TOKEN_SECRET_PRIVATE_KEY).
 * @property {string|null} privateKeyPath - Шлях до файлу з приватним ключем (для RS/ES алгоритмів), якщо `keySource` є 'file'.
 * @property {string|null} publicKeyPath - Шлях до файлу з публічним ключем (для RS/ES алгоритмів), якщо `keySource` є 'file'.
 * @property {string|null} jwksUri - URL для JWKS (JSON Web Key Set), якщо `keySource` є 'jwks'.
 * @property {string|null} keyIdentifier - Ідентифікатор ключа, який буде переданий до функції `loader`
 * (використовується, коли `keySource` є 'db').
 * @property {number} cacheTTL - Час життя кешованого ключа в мілісекундах.
 * @property {function(string): Promise<{key?: string, privateKey?: string, publicKey?: string}>} loader -
 * Асинхронна функція для завантаження ключів з бази даних або іншого сховища, якщо `keySource` є 'db'.
 * Повинна повертати об'єкт з `key` (для HS) або `privateKey`/`publicKey` (для RS/ES) в PEM-форматі.
 * @property {boolean} generateJti - Чи генерувати унікальний `jti` (JWT ID) для кожного токена автоматично.
 * @property {string|null} kid - Key ID (ідентифікатор ключа), який буде включено в заголовок токена.
 * @property {function(object): Promise<{isValid: boolean, errors?: string[]}>|null} payloadValidator -
 * Асинхронна callback-функція для додаткової валідації payload токена після його верифікації.
 * Повинна повертати об'єкт з `isValid` (булеве значення) та опціональним масивом `errors`.
 */

/**
 * Клас `JwtManager` надає централізоване управління JWT-токенами,
 * включаючи їх генерацію, верифікацію, кешування ключів та автооновлення.
 * Використовує патерн Singleton для забезпечення єдиного інстансу в додатку.
 */
class JwtManager {
    /** @private {JwtManager | null} Єдиний інстанс класу (для Singleton патерну). */
    static _instance = null

    /**
     * @private
     * @type {{info: function(...any): void, warn: function(...any): void, error: function(...any): void}}
     * Внутрішній об'єкт логера, який за замовчуванням використовує `console`.
     * Може бути замінений за допомогою методу `setLogger`.
     */
    _logger = {
        info: (...args) => console.log('INFO:', ...args),
        warn: (...args) => console.warn('WARN:', ...args),
        error: (...args) => console.error('ERROR:', ...args),
    }

    /**
     * Створює або повертає існуючий інстанс JwtManager (Singleton).
     * Якщо інстанс ще не створений, він ініціалізується з наданою конфігурацією.
     * @param {object} [userConfig={}] - Кастомна конфігурація токенів, що об'єднується з конфігурацією за замовчуванням.
     */
    constructor(userConfig = {}) {
        // Забезпечення патерну Singleton
        if (JwtManager._instance) {
            return JwtManager._instance
        }
        JwtManager._instance = this

        /**
         * @private
         * @type {object} Конфігурація за замовчуванням для різних типів токенів.
         * Користувач може перевизначати через `userConfig`.
         */
        this.defaultConfig = {
            tokenTypes: {
                /** @type {TokenConfig} */
                access: {
                    algorithm: 'HS256', // Алгоритм підпису JWT
                    expiresIn: '15m', // Час життя токена: 15 хвилин
                    keySource: 'env', // Ключ завантажується зі змінних оточення
                    secretKeyEnv: 'ACCESS_TOKEN_SECRET', // Назва змінної оточення для секретного ключа
                    privateKeyPath: null, // Не використовується для HS256
                    publicKeyPath: null, // Не використовується для HS256
                    jwksUri: null, // Не використовується для 'env' джерела
                    keyIdentifier: null, // Не використовується, якщо немає 'db' джерела
                    cacheTTL: 5 * 60 * 1000, // Час кешування ключа: 5 хвилин (в мс)
                    loader: async (keyId) => {
                        this._logger.warn(
                            `DB loader for key identifier '${keyId}' for token type 'access' is not implemented. Returning dummy keys.`,
                        )
                        // Приклад повернення фіктивних ключів для імітації завантаження з БД
                        if (this.defaultConfig.tokenTypes.access.algorithm.startsWith('HS')) {
                            return { key: 'dummy_db_access_secret' }
                        } else {
                            // Приклад для RS/ES, де ключ повертається в PEM форматі
                            return {
                                privateKey:
                                    '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----',
                                publicKey:
                                    '-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----',
                            }
                        }
                    },
                    generateJti: true, // Генерувати унікальний JTI для кожного access токена
                    kid: null, // Опціональний Key ID
                    payloadValidator: null, // Без додаткової валідації payload за замовчуванням
                },
                /** @type {TokenConfig} */
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
                        this._logger.warn(
                            `DB loader for key identifier '${keyId}' for token type 'refresh' is not implemented. Returning dummy keys.`,
                        )
                        if (this.defaultConfig.tokenTypes.refresh.algorithm.startsWith('HS')) {
                            return { key: 'dummy_db_refresh_secret' }
                        } else {
                            return {
                                privateKey:
                                    '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----',
                                publicKey:
                                    '-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----',
                            }
                        }
                    },
                    generateJti: true,
                    kid: null,
                    payloadValidator: null,
                },
                /** @type {TokenConfig} */
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
                    loader: async (keyId) => {
                        this._logger.warn(
                            `DB loader for key identifier '${keyId}' for token type 'apiKey' is not implemented. Returning dummy keys.`,
                        )
                        if (this.defaultConfig.tokenTypes.apiKey.algorithm.startsWith('HS')) {
                            return { key: 'dummy_db_api_secret' }
                        } else {
                            return {
                                privateKey:
                                    '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----',
                                publicKey:
                                    '-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----',
                            }
                        }
                    },
                    generateJti: false, // JTI рідко потрібен для API ключів
                    kid: null,
                    payloadValidator: null,
                },
            },
        }

        /**
         * @type {object} Об'єднана конфігурація, яка є результатом злиття `defaultConfig` та `userConfig`.
         * Це дозволяє легко налаштовувати поведінку `JwtManager`.
         */
        this.config = this.mergeConfigs(this.defaultConfig, userConfig)

        /**
         * @private
         * @type {Map<string, {keys: object, cachedAt: number, ttlMs: number}>} Кеш завантажених ключів.
         * Ключ мапи - це `tokenType` (наприклад, 'access', 'refresh').
         * Зберігає об'єкти ключів, час їх кешування та їхній TTL.
         */
        this.keyCache = new Map()

        /**
         * @private
         * @type {object} Об'єкт, що містить посилання на функції завантаження ключів для кожного `keySource`.
         * Дозволяє динамічно вибирати метод завантаження ключів.
         */
        this.keyLoaders = {
            env: this.loadFromEnv.bind(this),
            file: this.loadFromFile.bind(this),
            jwks: this.loadFromJwks.bind(this),
            db: this.loadFromDb.bind(this),
        }

        /** @private {NodeJS.Timeout | null} Таймер для функції автооновлення ключів. */
        this._refreshInterval = null

        /**
         * @private
         * @type {Map<string, Promise<object>>} Зберігає проміси завантаження ключів.
         * Використовується для запобігання гонки (race conditions) при одночасному запиті на завантаження одних і тих же ключів.
         */
        this._keyLoadingPromises = new Map()
    }

    /**
     * Повертає Singleton інстанс класу JwtManager.
     * Якщо інстанс ще не створений, він створюється з наданою конфігурацією.
     * @param {object} [userConfig={}] - Кастомна конфігурація токенів, що застосовується при першому створенні інстансу.
     * @returns {JwtManager} Єдиний інстанс JwtManager.
     */
    static getInstance(userConfig = {}) {
        return JwtManager._instance || new JwtManager(userConfig)
    }

    /**
     * Встановлює кастомний логер для JwtManager.
     * Переданий логер повинен мати методи `info`, `warn` та `error`,
     * що відповідають інтерфейсу `_logger`. Це дозволяє легко інтегрувати
     * зовнішні логінгові бібліотеки, такі як Winston або Pino.
     * @param {object} customLogger - Об'єкт логера з методами `info`, `warn`, `error`.
     */
    setLogger(customLogger) {
        // Перевіряємо, чи переданий об'єкт є дійсним логером з необхідними методами.
        if (
            customLogger &&
            typeof customLogger.info === 'function' &&
            typeof customLogger.warn === 'function' &&
            typeof customLogger.error === 'function'
        ) {
            this._logger = customLogger
            this._logger.info('Custom logger has been set.')
        } else {
            // Якщо логер недійсний, виводимо помилку в консоль і продовжуємо використовувати дефолтний логер.
            console.error(
                'ERROR: Invalid custom logger provided. It must have info, warn, and error methods.',
            )
        }
    }

    /**
     * Глибоко об'єднує дві конфігурації, з пріоритетом для значень з `overrides`.
     * Особливо обробляє вкладений об'єкт `tokenTypes`, дозволяючи перевизначення для кожного типу токена.
     * @param {object} defaults - Об'єкт конфігурації за замовчуванням.
     * @param {object} overrides - Об'єкт конфігурації, що перевизначає дефолтні значення.
     * @returns {object} Об'єднаний об'єкт конфігурації.
     */
    mergeConfigs(defaults, overrides) {
        // Створюємо поверхневу копію defaults, щоб не змінювати оригінал,
        // та глибоку копію `tokenTypes` для вкладених налаштувань.
        const merged = { ...defaults, tokenTypes: { ...defaults.tokenTypes } }
        // Ітеруємо по кожному типу токена в `overrides`
        for (const tokenType in overrides.tokenTypes || {}) {
            if (Object.prototype.hasOwnProperty.call(overrides.tokenTypes, tokenType)) {
                // Об'єднуємо дефолтні налаштування для даного типу токена з його перевизначеннями.
                merged.tokenTypes[tokenType] = {
                    ...defaults.tokenTypes[tokenType], // Зберігаємо дефолтні налаштування для цього типу токена
                    ...overrides.tokenTypes[tokenType], // Перезаписуємо їх кастомними
                }
            }
        }
        return merged
    }

    /**
     * Завантажує ключ(і) зі змінних оточення згідно з конфігурацією.
     * Для HS-алгоритмів очікує RAW ключ у змінній `cfg.secretKeyEnv`.
     * Для RS/ES-алгоритмів очікує PEM-кодовані приватний та публічний ключі
     * у змінних `cfg.secretKeyEnv_PRIVATE_KEY` та `cfg.secretKeyEnv_PUBLIC_KEY` відповідно.
     * @param {TokenConfig} cfg - Конфігурація для поточного типу токена.
     * @returns {Promise<{key?: Uint8Array | CryptoKey, privateKey?: CryptoKey, publicKey?: CryptoKey}>}
     * Об'єкт з ключами, імпортованими бібліотекою `jose`.
     * @throws {Error} Якщо необхідна змінна оточення не встановлена або ключ не може бути імпортований.
     */
    async loadFromEnv(cfg) {
        const secret = process.env[cfg.secretKeyEnv]
        if (!secret) {
            throw new Error(
                `Environment variable ${cfg.secretKeyEnv} for key source 'env' is not set.`,
            )
        }

        if (cfg.algorithm.startsWith('HS')) {
            // Для симетричних алгоритмів повертаємо ключ як Uint8Array
            return { key: Buffer.from(secret, 'utf-8') }
        } else {
            // Для асиметричних алгоритмів очікуємо окремі змінні для приватного та публічного ключів
            const privateKeyEnvName = `${cfg.secretKeyEnv}_PRIVATE_KEY`
            const publicKeyEnvName = `${cfg.secretKeyEnv}_PUBLIC_KEY`

            const privateKeyPEM = process.env[privateKeyEnvName]
            const publicKeyPEM = process.env[publicKeyEnvName]

            if (!privateKeyPEM)
                throw new Error(`Private key environment variable ${privateKeyEnvName} is not set.`)
            if (!publicKeyPEM)
                throw new Error(`Public key environment variable ${publicKeyEnvName} is not set.`)

            // Імпортуємо ключі з PEM-формату за допомогою `jose`
            const privateKey = await importPKCS8(privateKeyPEM, cfg.algorithm)
            const publicKey = await importSPKI(publicKeyPEM, cfg.algorithm)

            return { privateKey, publicKey }
        }
    }

    /**
     * Завантажує ключі з файлів (підтримує HS/RS/ES алгоритми).
     * Для HS-алгоритмів очікує RAW ключ у файлі за шляхом `cfg.secretKeyPath`.
     * Для RS/ES-алгоритмів очікує PEM-кодовані приватний та публічний ключі у файлах
     * за шляхами `cfg.privateKeyPath` та `cfg.publicKeyPath` відповідно.
     * @param {TokenConfig} cfg - Конфігурація для поточного типу токена.
     * @returns {Promise<{key?: Uint8Array | CryptoKey, privateKey?: CryptoKey, publicKey?: CryptoKey}>}
     * Об'єкт з ключами, імпортованими бібліотекою `jose`.
     * @throws {Error} Якщо шляхи до файлів не вказані, файли не знайдені або ключі не можуть бути імпортовані.
     */
    async loadFromFile(cfg) {
        if (cfg.algorithm.startsWith('HS')) {
            if (!cfg.secretKeyPath)
                throw new Error(
                    `'secretKeyPath' is required for 'file' keySource with HS algorithm.`,
                )
            // Читаємо секретний ключ з файлу
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

            // Читаємо приватний та публічний ключі з файлів
            const privateKeyPEM = await fs.readFile(
                path.resolve(process.cwd(), cfg.privateKeyPath),
                'utf-8',
            )
            const publicKeyPEM = await fs.readFile(
                path.resolve(process.cwd(), cfg.publicKeyPath),
                'utf-8',
            )

            // Імпортуємо ключі з PEM-формату за допомогою `jose`
            const privateKey = await importPKCS8(privateKeyPEM, cfg.algorithm)
            const publicKey = await importSPKI(publicKeyPEM, cfg.algorithm)

            return { privateKey, publicKey }
        }
    }

    /**
     * Завантажує ключі з бази даних або іншого користувацького сховища.
     * Вимагає, щоб у конфігурації `cfg` була надана функція `loader`.
     * Функція `loader` повинна повертати об'єкт з ключами в необробленому форматі (наприклад, рядки PEM),
     * які потім будуть імпортовані `jose`.
     * @param {TokenConfig} cfg - Конфігурація для поточного типу токена.
     * @returns {Promise<object>} Об'єкт з ключами, імпортованими бібліотекою `jose`.
     * @throws {Error} Якщо функція `loader` не надана або не вдалося завантажити/імпортувати ключі.
     */
    async loadFromDb(cfg) {
        if (typeof cfg.loader !== 'function') {
            throw new Error(`Missing 'loader' function in config for 'db' keySource of token type.`)
        }
        // Викликаємо користувацький завантажувач ключів
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
            // Імпортуємо ключі з PEM-формату за допомогою `jose`
            const privateKey = await importPKCS8(rawKeys.privateKey, cfg.algorithm)
            const publicKey = await importSPKI(rawKeys.publicKey, cfg.algorithm)
            return { privateKey, publicKey }
        }
    }

    /**
     * Завантажує JWKS (JSON Web Key Set) ключі з віддаленого URL.
     * Повертає функцію JWKS, яка використовується бібліотекою `jose` для верифікації.
     * @param {TokenConfig} cfg - Конфігурація для поточного типу токена.
     * @returns {Promise<{JWKS: ReturnType<typeof createRemoteJWKSet>}>} Об'єкт, що містить функцію JWKS.
     * @throws {Error} Якщо `jwksUri` не вказаний або URL недійсний.
     */
    async loadFromJwks(cfg) {
        if (!cfg.jwksUri) throw new Error(`'jwksUri' is required for 'jwks' keySource.`)
        try {
            // Створюємо функцію для отримання ключів з віддаленого JWKS URI
            const JWKS = createRemoteJWKSet(new URL(cfg.jwksUri))
            return { JWKS }
        } catch (error) {
            throw new Error(`Invalid JWKS URI: ${cfg.jwksUri}. Error: ${error.message}`)
        }
    }

    /**
     * Повертає ключі для заданого типу токена, використовуючи внутрішній кеш.
     * Якщо ключі відсутні в кеші або їх TTL вичерпано, вони будуть завантажені заново.
     * Використовує мапу `_keyLoadingPromises` для запобігання гонки (race conditions)
     * при одночасному запиті на завантаження ключів.
     * @param {string} tokenType - Тип токена (наприклад, 'access', 'refresh').
     * @returns {Promise<object>} Об'єкт з ключами (може містити `key`, `privateKey`, `publicKey` або `JWKS`).
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

        // Перевіряємо кеш. Якщо ключі дійсні (не прострочені), повертаємо їх з кешу.
        if (cacheEntry && now - cacheEntry.cachedAt < ttl) {
            return cacheEntry.keys
        }

        // Якщо вже є активний проміс для завантаження цих ключів, повертаємо його,
        // щоб уникнути повторного завантаження (debounce).
        if (this._keyLoadingPromises.has(tokenType)) {
            this._logger.info(`Ключі для '${tokenType}' вже завантажуються. Очікуємо завершення...`)
            return this._keyLoadingPromises.get(tokenType)
        }

        // Визначаємо функцію завантажувача ключів згідно з `keySource` в конфігурації.
        const loader = this.keyLoaders[cfg.keySource]
        if (!loader) {
            throw new Error(`No loader found for key source: ${cfg.keySource}.`)
        }

        this._logger.info(
            `Завантажуємо ключі для типу токена '${tokenType}' з джерела '${cfg.keySource}'...`,
        )

        // Запускаємо асинхронне завантаження ключів і зберігаємо проміс.
        const loadingPromise = (async () => {
            try {
                const keys = await loader(cfg)
                // Зберігаємо завантажені ключі в кеш разом з часом кешування та TTL.
                this.keyCache.set(tokenType, { keys, cachedAt: now, ttlMs: ttl })
                this._logger.info(`Ключі для '${tokenType}' успішно завантажено та кешовано.`)
                return keys
            } catch (error) {
                this._logger.error(
                    `Помилка завантаження ключів для '${tokenType}' з джерела '${cfg.keySource}':`,
                    error.message,
                )
                // Якщо завантаження не вдалося, видаляємо запис з кешу.
                this.keyCache.delete(tokenType)
                throw error // Перекидаємо помилку далі.
            } finally {
                // Видаляємо проміс з мапи після його завершення (успіху чи помилки).
                this._keyLoadingPromises.delete(tokenType)
            }
        })()

        this._keyLoadingPromises.set(tokenType, loadingPromise)
        return loadingPromise
    }

    /**
     * Примусово оновлює ключі в кеші для одного типу токена або для всіх.
     * Видаляє ключі з кешу і викликає `getKey` для їх повторного завантаження.
     * @param {string|null} [tokenType=null] - Тип токена для оновлення. Якщо `null`, оновлює ключі для всіх сконфігурованих типів токенів.
     * @returns {Promise<object|object[]>} - Оновлені ключі (для одного типу) або об'єкт з оновленими ключами для всіх типів.
     * @throws {Error} Якщо виникла помилка під час оновлення ключів (тільки для конкретного `tokenType`).
     */
    async forceReload(tokenType = null) {
        if (tokenType) {
            this.keyCache.delete(tokenType) // Видаляємо з кешу, щоб примусово завантажити
            return this.getKey(tokenType)
        }

        const results = {}
        for (const type of Object.keys(this.config.tokenTypes)) {
            this.keyCache.delete(type) // Видаляємо кожен тип з кешу
            try {
                results[type] = await this.getKey(type) // Завантажуємо заново
            } catch (e) {
                this._logger.error(`Помилка примусового оновлення ключів для '${type}':`, e.message)
                results[type] = { error: e.message } // Позначаємо помилку в результаті
            }
        }
        return results
    }

    /**
     * Очищає кеш ключів для одного типу токена або повністю.
     * @param {string|null} [tokenType=null] - Тип токена, кеш якого потрібно очистити. Якщо `null`, очищає весь кеш.
     */
    clearCache(tokenType = null) {
        if (tokenType) {
            this.keyCache.delete(tokenType)
            this._logger.info(`Кеш ключів для '${tokenType}' очищено.`)
        } else {
            this.keyCache.clear()
            this._logger.info('Кеш ключів повністю очищено.')
        }
    }

    /**
     * Створює підписаний JWT токен.
     * @param {object} payload - Дані для включення в payload токена.
     * @param {string} [tokenType='access'] - Тип токена, для якого застосовуються налаштування з конфігурації.
     * @param {object} [options={}] - Додаткові опції для підпису токена.
     * @param {string|number} [options.expiresIn] - Час життя токена. Може бути рядком ('15m', '1h') або числом секунд.
     * Якщо `options.exp` також вказано, `options.exp` має пріоритет.
     * @param {number} [options.exp] - Unix timestamp (в секундах) для встановлення клейму `exp` (термін дії). Має пріоритет над `expiresIn`.
     * @param {number} [options.iat] - Unix timestamp (в секундах) для встановлення клейму `iat` (час видачі).
     * Якщо не вказано, `jose` встановить поточний час за замовчуванням.
     * @param {number} [options.nbf] - Unix timestamp (в секундах) для встановлення клейму `nbf` (не дійсний до).
     * @param {string|string[]} [options.aud] - Аудиторія (audience) токена.
     * @param {string} [options.iss] - Емітент (issuer) токена.
     * @param {string} [options.sub] - Суб'єкт (subject) токена.
     * @param {string} [options.jti] - Унікальний ID токена (JWT ID). Якщо `generateJti` у конфігурації `true`,
     * і `options.jti` не вказано, JTI буде згенеровано автоматично.
     * @param {object} [options.header] - Додаткові дані для заголовка токена.
     * @returns {Promise<string>} Підписаний JWT токен.
     * @throws {Error} Якщо токен не може бути підписаний через відсутність ключів або неправильну конфігурацію.
     */
    async sign(payload, tokenType = 'access', options = {}) {
        const cfg = this.config.tokenTypes[tokenType]
        if (!cfg) {
            throw new Error(`Cannot sign token: Unknown token type '${tokenType}'.`)
        }

        const { key, privateKey } = await this.getKey(tokenType) // Отримуємо ключ для підпису з кешу/завантажуємо

        let signKey
        // Визначаємо, який ключ використовувати для підпису залежно від алгоритму
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

        const jwtSigner = new SignJWT({ ...payload }) // Створюємо новий об'єкт для підпису JWT з payload

        // Встановлюємо захищений заголовок токена
        const header = {
            alg: cfg.algorithm, // Алгоритм підпису
            ...(cfg.kid ? { kid: cfg.kid } : {}), // Опціональний Key ID з конфігурації
            ...(options.header || {}), // Додаткові заголовки з опцій
        }
        jwtSigner.setProtectedHeader(header)

        // Встановлюємо IAT (Issued At Time)
        // Бібліотека jose автоматично встановлює IAT на поточний час, якщо setIssuedAt() не викликається.
        // Тому, якщо options.iat не визначено, ми не викликаємо setIssuedAt(), дозволяючи jose встановити його за замовчуванням.
        if (options.iat !== undefined) {
            jwtSigner.setIssuedAt(options.iat)
        }

        // Визначаємо кінцеве значення для терміну дії токена (exp claim)
        // Пріоритет: options.exp > options.expiresIn > cfg.expiresIn
        let finalExpiresIn =
            options.exp !== undefined
                ? options.exp
                : options.expiresIn !== undefined
                ? options.expiresIn
                : cfg.expiresIn

        if (finalExpiresIn !== null && finalExpiresIn !== undefined) {
            const expiresInSeconds = this.parseExpiresIn(finalExpiresIn)
            if (expiresInSeconds === null) {
                // Якщо parseExpiresIn повернув null, це означає некоректний формат expiresIn
                throw new Error(
                    `Invalid 'expiresIn' format for token type '${tokenType}': ${finalExpiresIn}.`,
                )
            }
            jwtSigner.setExpirationTime(expiresInSeconds) // Встановлюємо термін дії
        }
        // Якщо finalExpiresIn був null або undefined, exp клейм просто не буде встановлено,
        // що означає токен без терміну дії.

        // Встановлюємо NBF (Not Before) клейм
        if (options.nbf !== undefined) {
            jwtSigner.setNotBefore(options.nbf)
        } else if (options.notBefore !== undefined) {
            // Додаткова перевірка для зворотньої сумісності
            jwtSigner.setNotBefore(options.notBefore)
        }

        // Встановлюємо опціональні клейми (Audience, Issuer, Subject)
        if (options.aud !== undefined) jwtSigner.setAudience(options.aud)
        if (options.iss !== undefined) jwtSigner.setIssuer(options.iss)
        if (options.sub !== undefined) jwtSigner.setSubject(options.sub)

        // Встановлюємо JTI (JWT ID)
        let jti = options.jwtid || options.jti // Може бути переданий як jwtid або jti
        if (jti === undefined && cfg.generateJti) {
            // Генеруємо JTI, якщо не передано і конфігурація дозволяє
            jti = generateJti()
        }
        if (jti !== undefined) {
            jwtSigner.setJti(jti)
        }

        return jwtSigner.sign(signKey) // Підписуємо токен
    }

    /**
     * Перевіряє валідність JWT токена і повертає його payload.
     * Виконує перевірку підпису, терміну дії, часу "не раніше" та опціональних клеймів (aud, iss, sub).
     * Також виконує додаткову валідацію payload, якщо `payloadValidator` визначений у конфігурації.
     * @param {string} token - JWT токен для перевірки.
     * @param {string} [tokenType='access'] - Тип токена, для якого застосовуються налаштування конфігурації.
     * @param {object} [options={}] - Додаткові опції для перевірки токена.
     * @param {string|string[]} [options.aud] - Очікувана аудиторія токена.
     * @param {string} [options.iss] - Очікуваний емітент токена.
     * @param {string} [options.sub] - Очікуваний суб'єкт токена.
     * @returns {Promise<object>} Розшифрований та валідований payload токена.
     * @throws {Error} Якщо токен недійсний (невірний підпис, протермінований, не пройшов валідацію payload тощо).
     */
    async verify(token, tokenType = 'access', options = {}) {
        const cfg = this.config.tokenTypes[tokenType]
        if (!cfg) {
            throw new Error(`Cannot verify token: Unknown token type '${tokenType}'.`)
        }

        // Отримуємо ключі, необхідні для верифікації
        const { key, publicKey, JWKS } = await this.getKey(tokenType)

        let result
        try {
            // Налаштування опцій верифікації для бібліотеки jose
            const verifyOptions = {
                algorithms: [cfg.algorithm], // Обов'язково вказуємо дозволений алгоритм
                audience: options.aud, // Опціональна перевірка аудиторії
                issuer: options.iss, // Опціональна перевірка емітента
                subject: options.sub, // Опціональна перевірка суб'єкта
            }

            // Використовуємо відповідний ключ для верифікації залежно від джерела ключів
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
            // Обробка типових помилок верифікації JWT
            let errorMessage = err.message
            if (err.code === 'ERR_JWT_EXPIRED') {
                errorMessage = 'Token has expired.'
            } else if (err.code === 'ERR_JWS_INVALID') {
                errorMessage = 'Invalid token signature.'
            } else if (err.code === 'ERR_JWT_NOT_YET_VALID') {
                errorMessage = 'Token is not yet valid.'
            }
            this._logger.error(`Token verification failed for type '${tokenType}': ${errorMessage}`)
            throw new Error(`Token verification failed for type '${tokenType}': ${errorMessage}`)
        }

        // Виконання додаткової користувацької валідації payload
        if (typeof cfg.payloadValidator === 'function') {
            const validationResult = await cfg.payloadValidator(result.payload)
            if (!validationResult || !validationResult.isValid) {
                const errors = validationResult?.errors?.join(', ') || 'unknown validation errors'
                this._logger.error(`Payload validation failed for type '${tokenType}': ${errors}`)
                throw new Error(`Payload validation failed for type '${tokenType}': ${errors}`)
            }
        }

        return result.payload // Повертаємо payload валідованого токена
    }

    /**
     * Розшифровує JWT токен без перевірки його підпису або інших клеймів.
     * Ця функція є корисною для швидкого отримання доступу до нечутливих даних
     * у токені, але **не повинна використовуватися для валідації безпеки**.
     * @param {string} token - JWT токен для декодування.
     * @returns {object | null} Декодований payload токена, або `null`, якщо токен не є валідним JWT
     * (наприклад, неправильний формат або неможливість парсингу).
     */
    decode(token) {
        try {
            return decodeJwt(token)
        } catch (error) {
            this._logger.error('Помилка декодування JWT токена:', error.message)
            return null
        }
    }

    /**
     * Розбирає рядок, що представляє тривалість (expiresIn), у кількість секунд.
     * Підтримує числові значення (секунди) та рядкові формати з одиницями часу:
     * 's' (секунди), 'm' (хвилини), 'h' (години), 'd' (дні).
     * @param {string|number|null|undefined} str - Час у форматі рядка, число секунд, `null` або `undefined`.
     * @returns {number | null} Час у секундах, або `null`, якщо формат некоректний, або `str` було `null`/`undefined`.
     */
    parseExpiresIn(str) {
        if (str === null || str === undefined) return null // Якщо вхідні дані null/undefined, повертаємо null
        if (typeof str === 'number') return str // Якщо вже число, повертаємо як є
        if (typeof str !== 'string' || str.trim() === '') return null // Якщо не рядок або порожній, повертаємо null

        // Регулярний вираз для парсингу: число + опціональна одиниця часу
        const match = /^(\d+)([smhd])?$/.exec(str.trim())
        if (!match) {
            this._logger.warn(`Некоректний формат expiresIn: '${str}'.`)
            return null // Некоректний формат рядка
        }

        const value = parseInt(match[1], 10) // Числове значення тривалості
        const unit = match[2] || 's' // Одиниця часу, за замовчуванням секунди

        // Множники для перетворення одиниць часу в секунди
        const multipliers = { s: 1, m: 60, h: 3600, d: 86400 }

        if (!multipliers[unit]) {
            this._logger.warn(`Невідома одиниця часу expiresIn: '${unit}' у '${str}'.`)
            return null // Невідома одиниця часу
        }

        return value * multipliers[unit] // Повертаємо тривалість у секундах
    }

    /**
     * Запускає автоматичне оновлення ключів для всіх сконфігурованих типів токенів.
     * Ключі будуть оновлюватися, якщо їхній термін кешування наближається до вичерпання
     * (за `intervalMs` до закінчення `cacheTTL`). Це допомагає підтримувати ключі актуальними.
     * @param {number} [intervalMs=60000] - Інтервал перевірки та ініціації оновлення в мілісекундах (за замовчуванням 1 хвилина).
     */
    startAutoRefresh(intervalMs = 60000) {
        if (this._refreshInterval) {
            this._logger.warn('Автооновлення ключів вже запущено.')
            return
        }
        this._logger.info(
            `Запускаємо автооновлення ключів з інтервалом ${intervalMs / 1000} секунд.`,
        )

        // Встановлюємо інтервал для періодичної перевірки та оновлення ключів
        this._refreshInterval = setInterval(async () => {
            for (const tokenType of Object.keys(this.config.tokenTypes)) {
                const cfg = this.config.tokenTypes[tokenType]
                const cacheEntry = this.keyCache.get(tokenType)
                const now = Date.now()

                // Оновлюємо ключі, якщо вони ще не кешовані, або термін кешування закінчується
                // (ініціюємо оновлення, коли до закінчення TTL лишається менше, ніж `intervalMs`).
                if (!cacheEntry || now - cacheEntry.cachedAt >= cfg.cacheTTL - intervalMs) {
                    try {
                        this._logger.info(`Ініціюємо оновлення ключів для '${tokenType}'...`)
                        await this.forceReload(tokenType) // Примусово оновлюємо ключ
                        this._logger.info(`Ключі для '${tokenType}' успішно оновлено.`)
                    } catch (e) {
                        this._logger.error(
                            `Помилка автооновлення ключів для '${tokenType}':`,
                            e.message,
                        )
                    }
                }
            }
        }, intervalMs)
    }

    /**
     * Зупиняє процес автоматичного оновлення ключів.
     * Очищає встановлений інтервал.
     */
    stopAutoRefresh() {
        if (this._refreshInterval) {
            clearInterval(this._refreshInterval)
            this._refreshInterval = null
            this._logger.info('Автооновлення ключів зупинено.')
        }
    }
}

export default JwtManager
