import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'
import compression from 'compression'
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
 * Отримує рядкове значення зі змінних оточення (ENV).
 * @param {string} key - Назва змінної.
 * @param {string} defaultValue - Дефолтне значення.
 */
export const getEnvString = (key, defaultValue) => {
    return process.env[key] || defaultValue
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
        this.appRoot = process.cwd() || path.resolve(__dirname, '../../')

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
        const envFile = path.join(this.appRoot, `.env.${this.nodeEnv}`)
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
        /**
         * Конфігурація Oracle Database за замовчуванням
         */
        const DEFAULT_ORACLE_CONFIG = {
            user: 'default_user',
            password: 'default_password',
            connectString: 'localhost/DEFAULTDB',
            poolAlias: null,
            poolMin: 1,
            poolMax: 10,
            poolIncrement: 1,
            poolTimeout: 60,
            enableStatistics: false,
        }

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
        const dbIdentifiers = (process.env.ORACLE_DB_NAMES || '')
            .split(',')
            .map((name) => name.trim())
            .filter((name) => name)

        const databaseConfigs = {}
        for (const dbName of dbIdentifiers) {
            const prefix = `${dbName.toUpperCase()}_ORACLE`

            const specificDefaults = {
                ...DEFAULT_ORACLE_CONFIG,
                poolAlias: `${dbName}_Pool`,
            }

            databaseConfigs[dbName] = getDbConnectionConfig(prefix, specificDefaults)
        }

        this.oracleDB = {
            thickModeOptions: {
                libDir: path.resolve(
                    process.env.ORACLEDB_CLIENT_LIB_DIR ||
                        path.join(this.appRoot, `bin/instantclient_23_6`),
                ),
            },
            availableDatabases: dbIdentifiers,
            primaryDatabaseName: process.env.ORACLE_DEFAULT_DB_NAME || dbIdentifiers[0],
            connections: databaseConfigs,
        }
    }

    /**
     * Ініціалізує параметри токенів (JWT).
     * @private
     * @throws {Error} Якщо секретні ключі JWT не визначені.
     */
    _initTokenConfig() {
        /**
         * Базові налаштування Cookie за замовчуванням.
         * @type {Object}
         */
        const DEFAULT_COOKIE_BASE = {
            httpOnly: true, // Захист від XSS атак
            secure: this.server.useHttps ?? true, // Тільки через HTTPS
            sameSite: 'lax', // Захист від CSRF атак
            path: '/',
        }

        /**
         * Конвертує текстовий формат часу (напр. '15m', '1h', '7d') у мілісекунди.
         * Підтримує одиниці: s (секунди), m (хвилини), h (години), d (дні).
         *
         * @example parseTimeToMs('15m') => 900000
         * @param {string|number} ttl - Час у текстовому форматі або числом.
         * @returns {number} Кількість мілісекунд для використання в Cookie maxAge.
         */
        const parseTimeToMs = (ttl) => {
            const units = {
                s: 1000,
                m: 60000,
                h: 3600000,
                d: 86400000,
            }

            const match = String(ttl).match(/^(\d+)([smhd])$/)
            if (!match) return parseInt(ttl, 10) || 0

            const [_, value, unit] = match
            return parseInt(value, 10) * units[unit]
        }

        /**
         * Фабрика для створення транспортної конфігурації (Cookie).
         * Автоматично синхронізує maxAge куки з expiresIn токена.
         *
         * @param {string} prefix - Префікс для ENV змінних (напр. 'ACCESS' або 'REFRESH').
         * @param {string} jwtExpiresIn - Час життя токена з налаштувань JWT.
         * @returns {Object} Об'єкт з іменем куки та параметрами встановлення.
         */
        const buildTransportConfig = (prefix, jwtExpiresIn) => {
            const envMaxAge = getEnvInt(`${prefix}_COOKIE_MAX_AGE`, null)

            return {
                cookie: {
                    name: getEnvString(`${prefix}_COOKIE_NAME`, `${prefix.toLowerCase()}Token`),
                    options: {
                        ...DEFAULT_COOKIE_BASE,
                        maxAge: envMaxAge ?? parseTimeToMs(jwtExpiresIn),
                        secure: getEnvBoolean(
                            `${prefix}_COOKIE_SECURE`,
                            DEFAULT_COOKIE_BASE.secure,
                        ),
                        sameSite: getEnvString(
                            `${prefix}_COOKIE_SAMESITE`,
                            DEFAULT_COOKIE_BASE.sameSite,
                        ),
                    },
                },
            }
        }

        const jwtIssuer = getEnvString('APP_JWT_ISS', 'https://my-api.com')
        const jwtAudience = getEnvString('APP_JWT_AUD', 'my-client')

        this.tokenTypes = {
            // --- ACCESS TOKEN CONFIG ---
            access: {
                id: 'access',
                // Криптографічні налаштування
                options: {
                    algorithm: getEnvString('ACCESS_JWT_ALG', 'HS256'),
                    expiresIn: getEnvString('ACCESS_JWT_EXP', '15m'),
                    issuer: jwtIssuer,
                    audience: jwtAudience,
                    generateJti: getEnvBoolean('ACCESS_JWT_JTI', true),
                },
                // Налаштування передачі
                transport: {
                    ...buildTransportConfig('ACCESS', getEnvString('ACCESS_JWT_EXP', '15m')),
                    header: { name: 'Authorization', prefix: 'Bearer' },
                },
                // Джерело ключів
                keyProvider: async (context, payload, operation) => {
                    return { secret: process.env.JWT_ACCESS_TOKEN_SECRET }
                },
            },

            // --- REFRESH TOKEN CONFIG ---
            refresh: {
                id: 'refresh',
                // Криптографічні налаштування
                options: {
                    algorithm: getEnvString('REFRESH_JWT_ALG', 'HS256'),
                    expiresIn: getEnvString('REFRESH_JWT_EXP', '1d'),
                    issuer: jwtIssuer,
                    audience: jwtAudience,
                    generateJti: getEnvBoolean('REFRESH_JWT_JTI', true),
                },
                // Налаштування передачі
                transport: {
                    ...buildTransportConfig('REFRESH', getEnvString('REFRESH_JWT_EXP', '1d')),
                },
                // Джерело ключів
                keyProvider: async (context, payload, operation) => {
                    return { secret: process.env.JWT_REFRESH_TOKEN_SECRET }
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

                // СУВОРЕ ОБМЕЖЕННЯ НА ВЕРСІЮ TLS 1.2
                minVersion: 'TLSv1.2',
                maxVersion: 'TLSv1.2',
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
        // Читаємо список з файлу налаштувань або .env. Якщо там порожньо, створюємо пустий масив.
        // Перетворюємо рядок "site1.com,site2.com" у масив ['site1.com', 'site2.com']
        // Перетворюємо рядки у RegExp, якщо вони починаються і закінчуються на "/"
        const envOrigins = process.env.ALLOWED_ORIGINS
            ? process.env.ALLOWED_ORIGINS.split(',').map((o) => {
                  const trimmed = o.trim()

                  if (trimmed.startsWith('/') && trimmed.endsWith('/')) {
                      // Вирізаємо слеші та створюємо регулярний вираз
                      return new RegExp(trimmed.slice(1, -1))
                  }
                  // Видаляємо протокол, якщо користувач випадково його записав в .env
                  return trimmed.replace(/^https?:\/\//, '')
              })
            : []

        const whitelistByEnv = {
            development: [
                'http://localhost:3000',
                'https://localhost:3000',
                'http://127.0.0.1:3000',
                'https://127.0.0.1:3000',
                `http://${this.server.host}:${this.server.ports.http}`,
                `https://${this.server.host}:${this.server.ports.https}`,
                // Додайте інші дозволені джерела для розробки
                ...envOrigins,
            ],
            production: [
                this.server.useHttp ? `http://${this.server.host}:${this.server.ports.http}` : null,
                this.server.useHttps
                    ? `https://${this.server.host}:${this.server.ports.https}`
                    : null,
                ...envOrigins,
            ],
            test: [
                `http://${this.server.host}:${this.server.ports.http}`,
                `https://${this.server.host}:${this.server.ports.https}`,
                ...envOrigins,
            ],
        }

        // Очищаємо від null та видаляємо дефолтні порти (:80 та :443) для точного збігу з браузером
        const allowedOrigins = (whitelistByEnv[this.nodeEnv] || [])
            .filter(Boolean)
            .map((origin) => {
                if (origin instanceof RegExp) return origin

                // Видаляємо протокол та дефолтні порти
                return origin.replace(/^https?:\/\//, '').replace(/(?::80|:443)$/, '')
            })

        return {
            origin: (origin, callback) => {
                // Якщо запит без Origin (наприклад, Postman, curl, мобільні додатки)
                if (!origin) {
                    return callback(null, true)
                }

                // Браузер також може прислати дефолтний порт у рідкісних кейсах, тому чистимо і його
                const normalizedOrigin = origin
                    ? origin.replace(/^https?:\/\//, '').replace(/(?::80|:443)$/, '')
                    : null

                // Перевіряємо збіг через .some(), який підтримує і рядки, і RegExp
                const isAllowed =
                    allowedOrigins.length === 0 ||
                    allowedOrigins.some((pattern) => {
                        if (pattern instanceof RegExp) {
                            return pattern.test(normalizedOrigin)
                        }
                        return pattern === normalizedOrigin
                    })

                if (isAllowed) {
                    callback(null, true)
                } else {
                    callback(new Error(`Origin '${origin}' не дозволено правилами CORS.`))
                }
            },
            // Дозволяє надсилати кукі разом із запитами
            credentials: true,
        }
    }

    /**
     * Отримує опції для стиснення HTTP-відповідей (gzip/deflate).
     * @returns {object} Об'єкт налаштувань стиснення для middleware 'compression'.
     */
    getCompressionOptions() {
        return {
            // Рівень стиснення (1 - найшвидший, 9 - найсильніший)
            // Рівень 1 ідеальний для API: економить CPU сервера при високому навантаженні
            level: getEnvInt('COMPRESSION_LEVEL', 6),
            // Мінімальний розмір файлу для стиснення (1 КБ)
            // Менші файли стискати немає сенсу, бо заголовки Gzip додадуть більше ваги
            threshold: getEnvInt('COMPRESSION_THRESHOLD', 1024),
            //
            filter: (req, res) => {
                // Отримуємо тип контенту, який збираємось віддати
                const contentType = res.getHeader('Content-Type') || ''

                // Список типів, які НЕ треба стискати (бінарні дані)
                const skipCompressionTypes = [
                    'application/octet-stream',
                    'application/zip',
                    'application/pdf',
                    'image/',
                ]

                // ПРАВИЛО 1: Ніколи не стискати бінарні потоки (LOB/Файли)
                // Бінарні дані (zip, exe, jpg, pdf) вже стиснуті, повторний Gzip лише зависне
                if (
                    contentType &&
                    skipCompressionTypes.some((type) => contentType.includes(type))
                ) {
                    return false
                }

                // ПРАВИЛО 2: Не стискати, якщо клієнт надіслав спеціальний заголовок
                // (Наприклад, може додати 'X-No-Compression')
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
