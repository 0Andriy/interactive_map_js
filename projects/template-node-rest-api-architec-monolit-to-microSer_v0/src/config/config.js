import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'
import compression from 'compression' // Використовується для getCompressionOptions
import os from 'os'

import { fileURLToPath } from 'url'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ⚠️ УВАГА: Цей рядок КОНТРАІНДИКОВАНИЙ для Production середовищ!
// Він вимикає перевірку SSL-сертифікатів і створює серйозні ризики безпеки.
// Залиште його лише для локальної розробки/тестування, якщо це абсолютно необхідно.
// В Production завжди забезпечуйте належні сертифікати та їх перевірку.
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0'

/**
 * Допоміжна функція для безпечного парсингу цілих чисел зі змінних середовища.
 * @param {string} envVarName - Назва змінної середовища.
 * @param {number} defaultValue - Значення за замовчуванням, якщо змінна не визначена або не є числом.
 * @returns {number} Розпарсоване ціле число або значення за замовчуванням.
 */
const getEnvInt = (envVarName, defaultValue) => {
    const value = process.env[envVarName]
    const parsed = parseInt(value, 10)
    return isNaN(parsed) ? defaultValue : parsed
}

/**
 * Допоміжна функція для безпечного отримання булевих значень зі змінних середовища.
 * @param {string} envVarName - Назва змінної середовища.
 * @param {boolean} defaultValue - Значення за замовчуванням.
 * @returns {boolean} Булеве значення.
 */
const getEnvBoolean = (envVarName, defaultValue) => {
    const value = process.env[envVarName]
    if (value === undefined) {
        return defaultValue
    }
    return value.toLowerCase() === 'true' || value === '1'
}

/**
 * Клас Config для централізованого управління конфігурацією програми.
 * Реалізує патерн Singleton для забезпечення єдиного екземпляра.
 */
class Config {
    /**
     * @private
     * @type {Config | null} Єдиний екземпляр класу (для патерну Singleton).
     */
    static #instance = null

    /**
     * Приватний конструктор для забезпечення патерну Singleton.
     * Ініціалізує всі конфігураційні параметри з .env файлів або значеннями за замовчуванням.
     * @throws {Error} Якщо відсутні критично важливі змінні середовища (наприклад, секретні ключі).
     */
    constructor() {
        if (Config.#instance) {
            // Якщо екземпляр вже існує, повертаємо його
            return Config.#instance
        }
        // Ініціалізуємо новий екземпляр як єдиний
        Config.#instance = this

        // Визначення корення проекту
        this.appRoot = process.cwd()

        // Визначення середовища (development, production, test)
        this.nodeEnv = process.env.NODE_ENV || 'development'

        // Завантаження конфігурації з .env файлів
        this._loadEnvConfig()

        // Налаштування для логування
        this._initLoggerConfig()

        // Ініціалізація основних розділів конфігурації
        this._initServerConfig()
        this._initOracleDBConfig()
        this._initTokenConfig()
        this._initWebSocketConfig()
    }

    /**
     * Повертає єдиний екземпляр класу Config (Singleton).
     * Якщо екземпляр ще не створений, він створюється при першому виклику.
     * @returns {Config} Єдиний екземпляр Config.
     */
    static getInstance() {
        if (!Config.#instance) {
            Config.#instance = new Config()
        }
        return Config.#instance
    }

    /**
     * Завантажує змінні середовища з відповідного .env файлу.
     * Завантажує `.env.<NODE_ENV>` або, якщо його немає, стандартний `.env`.
     * @private
     */
    _loadEnvConfig() {
        const envFile = path.join(__dirname, '../', `.env.${this.nodeEnv}`)
        if (fs.existsSync(envFile)) {
            dotenv.config({ path: envFile })
        } else {
            console.warn(
                `[Config] Конфігураційний файл ${envFile} не знайдено. Використовуються налаштування середовища за замовчуванням.`,
            )
            dotenv.config() // Завантажити стандартний .env файл
        }
    }

    /**
     * Ініціалізує налаштування для Logger.
     * @private
     */
    _initLoggerConfig() {
        this.logger = {
            type: process.env.LOGGER_TYPE || 'winston', // За замовчуванням 'console'
            winston: {
                level: process.env.WINSTON_LOG_LEVEL || 'debug', // Контроль рівня логування Winston через env
            },
        }
    }

    /**
     * Ініціалізує параметри сервера.
     * @private
     */
    _initServerConfig() {
        const localIp = this.getLocalIp()
        this.server = {
            host: process.env.HOST || localIp || '0.0.0.0',
            ports: {
                http: getEnvInt('HTTP_PORT', 8080),
                https: getEnvInt('HTTPS_PORT', 8443),
            },
            ssl: {
                keyPath: process.env.SSL_KEY_PATH || path.join(__dirname, 'certs', './ssl/key.pem'),
                certPath:
                    process.env.SSL_CERT_PATH || path.join(__dirname, 'certs', './ssl/cert.pem'),
            },
            useHttp: getEnvBoolean('USE_HTTP', true), // Перемикач для HTTP сервера
            useHttps: getEnvBoolean('USE_HTTPS', false), // Перемикач для HTTPS сервера
        }
    }

    /**
     * Ініціалізує налаштування для OracleDB.
     * @private
     */
    _initOracleDBConfig() {
        const getDbConnectionConfig = (dbPrefix, defaults) => ({
            user: process.env[`${dbPrefix}_USER`] || defaults.user,
            password: process.env[`${dbPrefix}_PASSWORD`] || defaults.password,
            connectString: process.env[`${dbPrefix}_CONNECT_STRING`] || defaults.connectString,
            poolMin: getEnvInt(`${dbPrefix}_POOL_MIN`, defaults.poolMin),
            poolMax: getEnvInt(`${dbPrefix}_POOL_MAX`, defaults.poolMax),
            poolIncrement: getEnvInt(`${dbPrefix}_POOL_INCREMENT`, defaults.poolIncrement),
            poolTimeout: getEnvInt(`${dbPrefix}_POOL_TIMEOUT`, defaults.poolTimeout),
            enableStatistics: getEnvBoolean(
                `${dbPrefix}_ENABLE_STATISTICS`,
                defaults.enableStatistics,
            ),
            poolAlias: process.env[`${dbPrefix}_POOL_ALIAS`] || defaults.poolAlias || dbPrefix,
        })

        // Визначення баз даних, які потрібно завантажити
        const dbNames = (process.env.ORACLE_DB_NAMES || 'DB1') // Значення за замовчуванням
            .split(',')
            .map((name) => name.trim())
            .filter((name) => name) // Розділити за комами та прибрати пусті елементи

        const defaultDbSettings = {
            user: 'default_user',
            password: 'default_password',
            connectString: 'localhost/DEFAULTDB',
            poolMin: 1,
            poolMax: 10,
            poolIncrement: 1,
            poolTimeout: 60,
            enableStatistics: false,
            poolAlias: null,
        }

        const configuredDbs = {}
        for (const dbName of dbNames) {
            // Тут можна визначити дефолтні значення для кожної конкретної БД,
            // або використовувати загальні defaultDbSettings
            const specificDefaults = {
                ...defaultDbSettings,
                // Можна перевизначити defaults для конкретної БД, якщо потрібно
                // наприклад, якщо dbName === 'ERP_PROD', { poolMax: 100 }
                poolAlias: `${dbName}_Pool`,
            }

            configuredDbs[dbName] = getDbConnectionConfig(
                `ORACLE_${dbName.toUpperCase()}`,
                specificDefaults,
            )
        }

        this.oracleDB = {
            useThickMode: getEnvBoolean('ORACLE_USE_THICK_MODE', true),
            ClientOpts: {
                libDir:
                    process.env.NODE_ORACLEDB_CLIENT_LIB_DIR ||
                    path.join(__dirname, '../../dependencies/instantclient_23_6'),
            },
            enableProfiling: getEnvBoolean('ORACLE_ENABLE_PROFILING', false),
            maskAllParams: getEnvBoolean('ORACLE_MASK_ALL_PARAMS', false),
            maskingRules: {
                params: [
                    { pattern: /password/i, excludePatterns: [], replaceWith: '[PASSWORD_HIDDEN]' },
                    { pattern: /token/i, excludePatterns: [], replaceWith: '[TOKEN_HIDDEN]' },
                    { pattern: /cvv/i, excludePatterns: [], replaceWith: '[CVV_MASKED]' },
                ],
            },
            defaultDbName: process.env.ORACLE_DEFAULT_DB_NAME || dbNames[0],
            db: configuredDbs,
        }
    }

    /**
     * Ініціалізує параметри токенів (JWT).
     * @private
     * @throws {Error} Якщо секретні ключі JWT не визначені.
     */
    _initTokenConfig() {
        // Загальні опції JWT, які застосовуються до всіх токенів за замовчуванням
        this.generalOptions = {
            issuer: process.env.JWT_ISSUER || 'your-service.com', // Видавець токену
            audience: process.env.JWT_AUDIENCE || 'your-api-client', // Аудиторія токену
        }

        // Базова конфігурація для всіх типів токенів для зменшення дублювання
        const baseTokenConfig = {
            privateKeyPath: null,
            publicKeyPath: null,
            jwksUri: null,
            keyIdentifier: null,
            payloadValidator: null,
            kid: null,
        }

        // Базові налаштування для розміщення токенів у HTTP Cookie
        const baseCookieOptions = {
            httpOnly: true,
            secure: true,
            sameSite: 'lax',
            path: '/',
        }

        this.tokenTypes = {
            access: {
                ...baseTokenConfig,
                algorithm: process.env.JWT_ACCESS_ALGORITHM || 'HS256',
                expiresIn: process.env.JWT_ACCESS_TOKEN_EXPIRATION || '15m',
                keySource: 'db',
                secretKeyEnv: 'JWT_ACCESS_TOKEN_SECRET',
                cacheTTL: getEnvInt('JWT_ACCESS_KEY_CACHE_TTL', 5 * 60 * 1000),
                generateJti: getEnvBoolean('JWT_ACCESS_GENERATE_JTI', true),
                loader: async (keyId) => {},
                cookie: {
                    name: process.env.JWT_ACCESS_TOKEN_COOKIE_NAME || 'accessTokenCookie',
                    options: {
                        ...baseCookieOptions,
                        maxAge: getEnvInt('JWT_ACCESS_TOKEN_COOKIE_MAX_AGE', 15 * 60 * 1000),
                        httpOnly: getEnvBoolean(
                            'JWT_ACCESS_TOKEN_COOKIE_HTTP_ONLY',
                            baseCookieOptions.httpOnly,
                        ),
                        secure: getEnvBoolean(
                            'JWT_ACCESS_TOKEN_COOKIE_SECURE',
                            baseCookieOptions.secure,
                        ),
                        sameSite:
                            process.env.JWT_ACCESS_TOKEN_COOKIE_SAMESITE ||
                            baseCookieOptions.sameSite,
                        path: process.env.JWT_ACCESS_TOKEN_COOKIE_PATH || baseCookieOptions.path,
                    },
                },
                header: {
                    name: 'Authorization',
                    prefix: 'Bearer',
                },
            },

            refresh: {
                ...baseTokenConfig,
                algorithm: process.env.JWT_REFRESH_ALGORITHM || 'HS256',
                expiresIn: process.env.JWT_REFRESH_TOKEN_EXPIRATION || '7d',
                keySource: 'db',
                secretKeyEnv: 'JWT_REFRESH_TOKEN_SECRET',
                cacheTTL: getEnvInt('JWT_REFRESH_KEY_CACHE_TTL', 5 * 60 * 1000),
                generateJti: getEnvBoolean('JWT_REFRESH_GENERATE_JTI', true),
                loader: async (keyId) => {},
                cookie: {
                    name: process.env.JWT_REFRESH_TOKEN_COOKIE_NAME || 'refreshTokenCookie',
                    options: {
                        ...baseCookieOptions,
                        maxAge: getEnvInt(
                            'JWT_REFRESH_TOKEN_COOKIE_MAX_AGE',
                            7 * 24 * 60 * 60 * 1000,
                        ),
                        httpOnly: getEnvBoolean(
                            'JWT_REFRESH_TOKEN_COOKIE_HTTP_ONLY',
                            baseCookieOptions.httpOnly,
                        ),
                        secure: getEnvBoolean(
                            'JWT_REFRESH_TOKEN_COOKIE_SECURE',
                            baseCookieOptions.secure,
                        ),
                        sameSite:
                            process.env.JWT_REFRESH_TOKEN_COOKIE_SAMESITE ||
                            baseCookieOptions.sameSite,
                        path: process.env.JWT_REFRESH_TOKEN_COOKIE_PATH || baseCookieOptions.path,
                    },
                },
                header: {
                    name: null,
                    prefix: null,
                },
            },
        }

        /**
         * Конвертує рядок часу (наприклад, '15m', '1h', '30s') у мілісекунди.
         * Підтримує 's' (секунди), 'm' (хвилини), 'h' (години), 'd' (дні).
         *
         * @param {string} timeString - Рядок, що представляє тривалість часу.
         * @returns {number} Кількість мілісекунд.
         */
        function convertToMilliseconds(timeString) {
            if (typeof timeString !== 'string') {
                return 0
            }

            const value = parseInt(timeString, 10)
            const unit = timeString.slice(-1)

            switch (unit) {
                case 's':
                    return value * 1000
                case 'm':
                    return value * 60 * 1000
                case 'h':
                    return value * 60 * 60 * 1000
                case 'd':
                    return value * 24 * 60 * 60 * 1000
                default:
                    return parseInt(timeString, 10) || 0
            }
        }

        /**
         * Проходить по всім типам токенів у this.tokenTypes
         * та синхронізує maxAge куки з expiresIn токена,
         * враховуючи можливе перевизначення через змінні середовища.
         * @param {object} jwtConfig - Об'єкт this.tokenTypes.
         */
        function syncTokenCookieMaxAge(jwtConfig) {
            for (const tokenType in jwtConfig) {
                if (jwtConfig.hasOwnProperty(tokenType)) {
                    const tokenConf = jwtConfig[tokenType]

                    // Перевіряємо, чи існує конфігурація куки для цього типу токена
                    if (tokenConf.cookie && tokenConf.cookie.options) {
                        const envMaxAgeKey = `JWT_${tokenType.toUpperCase()}_TOKEN_COOKIE_MAX_AGE`
                        const defaultExpiresInMs = convertToMilliseconds(tokenConf.expiresIn)

                        tokenConf.cookie.options.maxAge = getEnvInt(
                            envMaxAgeKey,
                            defaultExpiresInMs,
                        )
                    }
                }
            }
        }

        // Викликаємо функцію для всіх токенів після їх визначення
        syncTokenCookieMaxAge(this.tokenTypes)
    }

    /**
     * Ініціалізує налаштування для WebSocket.
     * @private
     */
    _initWebSocketConfig() {
        this.websocket = {
            path: process.env.WS_PATH || '/ws',
            defaultRoomUpdateInterval: getEnvInt('WS_DEFAULT_ROOM_UPDATE_INTERVAL', 5000),
        }

        // Завантаження попередньо визначених кімнат
        const predefinedRoomNames = (process.env.PREDEFINED_ROOM_NAMES || '')
            .split(',')
            .map((name) => name.trim())
            .filter((name) => name) // Фільтруємо пусті рядки

        this.websocket.predefinedRooms = predefinedRoomNames.map((roomName) => {
            const upperRoomName = roomName.toUpperCase() // Для відповідності ENV змінним
            return {
                name: roomName,
                description:
                    process.env[`${upperRoomName}_DESCRIPTION`] ||
                    `Default description for ${roomName}`,
                updates: {
                    enabled: getEnvBoolean(`${upperRoomName}_UPDATES_ENABLED`, false),
                    intervalMs: getEnvInt(
                        `${upperRoomName}_UPDATES_INTERVAL_MS`,
                        this.websocket.defaultRoomUpdateInterval,
                    ),
                    dataSource:
                        process.env[`${upperRoomName}_UPDATES_DATA_SOURCE`] || 'getRoomData',
                },
            }
        })

        this.websocket.predefinedRooms = [
            ...this.websocket.predefinedRooms,
            ...[
                {
                    name: 'global-news',
                    updates: {
                        enabled: true,
                        intervalMs: 5000, // Оновлення кожні 5 секунд
                        dataSource: 'getNewsFeedData', // Використовувати метод getNewsFeedData з dbService
                    },
                },
                {
                    name: 'system-status',
                    updates: {
                        enabled: true,
                        intervalMs: 2000, // Оновлення кожні 2 секунди
                        dataSource: 'getRoomData', // Для простоти використовуємо getRoomData
                    },
                },
            ],
        ]
    }

    /**
     * Отримує параметри для SSL-сертифікатів.
     * @returns {{key: Buffer, cert: Buffer}} Об'єкт з ключем та сертифікатом SSL.
     * @throws {Error} Якщо не вдається прочитати файли SSL.
     */
    getSslOptions() {
        const { keyPath, certPath } = this.server.ssl

        try {
            return {
                key: fs.readFileSync(keyPath),
                cert: fs.readFileSync(certPath),
            }
        } catch (error) {
            console.error(
                `[Config] Помилка читання SSL-файлів з '${keyPath}' та '${certPath}'. Помилка: ${error.message}`,
            )
            throw new Error('Не вдалося завантажити SSL-файли. Перевірте конфігурацію та шляхи.')
        }
    }

    /**
     * Отримує опції для CORS (Cross-Origin Resource Sharing).
     * Дозволені джерела залежать від поточного NODE_ENV.
     * @returns {object} Об'єкт налаштувань CORS для Express.js.
     */
    getCorsOptions() {
        const whitelistByEnv = {
            development: [
                'http://localhost:3000',
                'https://localhost:3000',
                'http://127.0.0.1:3000',
                'https://127.0.0.1:3000',
                'http://0.0.0.0:3000',
                'https://0.0.0.0:3000',
                // Додайте інші дозволені джерела для розробки
            ],
            production: [
                'https://myapp.com',
                'https://frontend.myapp.com',
                // Додайте дозволені джерела для production
            ],
            test: [], // Для тестів зазвичай не потрібні конкретні джерела
        }

        const allowedOrigins = whitelistByEnv[this.nodeEnv] || []

        return {
            origin: (origin, callback) => {
                // Дозволяємо запити без "origin" (наприклад, з мобільних додатків або curl)
                if (!origin || allowedOrigins.includes(origin)) {
                    callback(null, true) // Дозволено
                } else {
                    callback(new Error(`Origin '${origin}' не дозволено правилами CORS.`))
                }
            },
            credentials: true, // Дозволяє надсилати кукі разом із запитами
        }
    }

    /**
     * Отримує опції для стиснення HTTP-відповідей (gzip/deflate).
     * @returns {object} Об'єкт налаштувань стиснення для middleware 'compression'.
     */
    getCompressionOptions() {
        return {
            level: getEnvInt('COMPRESSION_LEVEL', 6), // Рівень стиснення (0-9)
            threshold: getEnvInt('COMPRESSION_THRESHOLD', 1024), // Мінімальний розмір відповіді для стиснення (в байтах), 1 KB
            filter: (req, res) => {
                // Якщо заголовок 'x-no-compression' присутній, стиснення не застосовується
                if (req.headers['x-no-compression']) {
                    return false
                }
                // Використовується стандартний фільтр 'compression' (за замовчуванням стискає HTML, CSS, JS, JSON тощо)
                return compression.filter(req, res)
            },
        }
    }

    /**
     * Отримує локальну IP-адресу машини (не 127.0.0.1).
     * Корисно для доступу до сервера в локальній мережі.
     * @returns {string|null} IP-адреса або null, якщо не знайдено не-внутрішнього IPv4.
     */
    getLocalIp() {
        const interfaces = os.networkInterfaces()

        for (const interfaceName of Object.keys(interfaces)) {
            for (const iface of interfaces[interfaceName]) {
                const { family, address, internal } = iface

                // Шукаємо IPv4 адресу, яка не є внутрішньою (loopback)
                if (family === 'IPv4' && !internal) {
                    return address
                }
            }
        }
        return null
    }
}

// Експортуємо єдиний екземпляр класу Config (Singleton)
export default Config.getInstance()
