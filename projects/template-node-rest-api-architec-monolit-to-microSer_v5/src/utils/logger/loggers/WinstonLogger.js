// src/utils/logger/WinstonLogger.js

/**
 * @fileoverview Розширена реалізація логера, що використовує бібліотеку Winston,
 * включаючи ротацію файлів, маскування чутливих полів та AsyncLocalStorage для контексту.
 * Розширює абстрактний клас ILogger, щоб інтегруватися в загальну архітектуру логування.
 */

import winston from 'winston' // Логер
import 'winston-daily-rotate-file' // Плагін для ротації файлів Winston
import path from 'path' // Модуль для роботи з шляхами файлової системи
import { AsyncLocalStorage } from 'async_hooks' // Модуль для збереження контексту в асинхронних операціях
import ILogger from './ILogger.js' // Імпортуємо наш інтерфейс логера

import { fileURLToPath } from 'url'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Ініціалізація AsyncLocalStorage для збереження контексту виконання, такого як requestId та correlationId.
 * Використовується для трасування логів через різні асинхронні операції.
 * @type {AsyncLocalStorage<object>}
 */
export const asyncLocalStorage = new AsyncLocalStorage()

/**
 * Визначає рівні логування та їх пріоритети.
 * error має найвищий пріоритет (0), а silly — найнижчий (6).
 * Логи нижчого рівня, ніж поточний, ігноруються.
 * @type {object}
 * @property {number} error - Рівень для критичних помилок.
 * @property {number} warn - Рівень для попереджень.
 * @property {number} info - Рівень для інформаційних повідомлень.
 * @property {number} http - Рівень для HTTP-запитів та відповідей.
 * @property {number} verbose - Рівень для детальних повідомлень.
 * @property {number} debug - Рівень для налагоджувальних повідомлень.
 * @property {number} silly - Найнижчий рівень, для дуже детальних повідомлень.
 */
const logLevels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    verbose: 4,
    debug: 5,
    silly: 6,
}

/**
 * @typedef {object} MaskingRule
 * @property {RegExp} pattern - Регулярний вираз для співставлення з ключами полів.
 * @property {string} [replaceWith='[MASKED]'] - Рядок, на який буде замінено значення маскованого поля.
 * @property {RegExp[]} [excludePatterns=[]] - Масив регулярних виразів для виключення певних ключів з маскування.
 */

/**
 * Маскує чутливі поля в об'єкті або масиві об'єктів на будь-якій глибині.
 * Використовує надані правила маскування для заміни значень.
 *
 * @param {object|Array|*} data - Об'єкт або масив, що потенційно містить чутливі дані, або примітивне значення.
 * @param {MaskingRule[]} maskingRules - Масив об'єктів з правилами маскування (регулярний вираз та рядок заміни).
 * @returns {object|Array|*} Копія об'єкта/масиву з маскованими чутливими полями або оригінальне примітивне значення.
 */
export function maskSensitiveFields(data, maskingRules) {
    if (data === null || typeof data !== 'object') {
        return data
    }

    if (Array.isArray(data)) {
        return data.map((item) => maskSensitiveFields(item, maskingRules))
    }

    const maskedData = {}
    for (const key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
            let isMasked = false
            let replacement = '[MASKED]'

            for (const rule of maskingRules) {
                // Спочатку перевіряємо, чи є винятки і чи ключ відповідає будь-якому з них
                let isExcluded = false
                if (rule.excludePatterns && rule.excludePatterns.length > 0) {
                    isExcluded = rule.excludePatterns.some((excludePattern) =>
                        excludePattern.test(key),
                    )
                }

                // Тепер перевіряємо основний шаблон та виключення
                if (rule.pattern.test(key) && !isExcluded) {
                    replacement = rule.replaceWith || '[MASKED]'
                    isMasked = true
                    break // Знайшли правило, застосували, виходимо
                }
            }

            if (isMasked) {
                maskedData[key] = replacement
            } else {
                maskedData[key] = maskSensitiveFields(data[key], maskingRules)
            }
        }
    }
    return maskedData
}

/**
 * Повертає скомбінований формат для логів, який може бути використаний як для консолі, так і для файлів.
 * Додає мітку часу, обробку помилок зі стеком, requestId, correlationId та застосовує маскування.
 *
 * @param {boolean} [isConsole=false] - Чи призначений формат для консольного виводу (включає кольори та вирівнювання).
 * @param {MaskingRule[]} maskingRules - Масив правил маскування для чутливих даних.
 * @returns {winston.Format} Скомбінований формат Winston.
 */
const getLogFormat = (isConsole = false, maskingRules) => {
    // Спочатку визначимо базові формати, які завжди присутні
    const baseFormats = [
        winston.format.timestamp(), //{ format: 'YYYY-MM-DD HH:mm:ss.SSS' }
        winston.format.errors({ stack: true }),

        // Додаємо requestId та correlationId до метаданих логу та застосовуємо маскування
        winston.format((info) => {
            const store = asyncLocalStorage.getStore()
            info.requestId = store ? store.requestId : 'N/A'
            info.correlationId = store ? store.correlationId : 'N/A'

            // Застосовуємо маскування до *поточного* об'єкта info.
            const maskedInfoContent = maskSensitiveFields({ ...info }, maskingRules)

            // Скопіюйте всі замасковані властивості назад в оригінальний об'єкт info.
            // Це дозволяє наступним форматам працювати з тим же об'єктом.
            Object.assign(info, maskedInfoContent)

            return info // Повертаємо *оригінальний* (модифікований) об'єкт info
        })(),
    ]

    let finalFormats // Змінна для зберігання фінального комбінованого формату

    if (isConsole) {
        // Якщо це консоль, додаємо printf для консолі та кольоризацію
        finalFormats = winston.format.combine(
            ...baseFormats, // Додаємо базові формати
            winston.format.printf(
                ({
                    timestamp,
                    level,
                    message,
                    service,
                    stack,
                    requestId,
                    correlationId,
                    ...meta
                }) => {
                    const metaString = Object.keys(meta).length
                        ? `\nMetadata: ${JSON.stringify(meta, null, 2)}`
                        : ''
                    const correlationInfo = `ReqID: ${requestId}, CorrID: ${correlationId}`
                    return `${timestamp} [${level.toUpperCase()}]: [${
                        service || ''
                    }] ${message} (${correlationInfo}) ${stack ? `\n${stack}` : ''} ${metaString}\n`
                },
            ),
            winston.format.colorize({ all: true }), // Додає кольори для консолі
        )
    } else {
        // Якщо це не консоль (для файлів), додаємо JSON формат
        finalFormats = winston.format.combine(
            ...baseFormats, // Додаємо базові формати
            winston.format.json(), // Використовуємо стандартний JSON формат Winston
            winston.format.printf(
                ({
                    timestamp,
                    level,
                    message,
                    service,
                    stack,
                    requestId,
                    correlationId,
                    ...meta
                }) => {
                    const logEntry = {
                        timestamp,
                        level,
                        service: service || undefined,
                        message,
                        requestId,
                        correlationId,
                        ...(stack && { stack }),
                        ...(Object.keys(meta).length > 0 && { meta }),
                    }
                    return `${JSON.stringify(logEntry, null, 4)}\n` // Повертаємо стиснутий JSON
                },
            ),
        )
    }

    return finalFormats
}

/**
 * Створює фільтр Winston, який пропускає лише логи певного рівня.
 * @param {string} level - Рівень логування, за яким потрібно фільтрувати.
 * @returns {winston.Format} Формат-фільтр Winston.
 */
const createLevelFilter = (level) =>
    winston.format((info) => (info.level === level ? info : false))()

/**
 * Створює транспорт для запису логів у файл з ротацією (DailyRotateFile).
 * @param {object} options - Опції для транспорту.
 * @param {string} options.level - Мінімальний рівень логування для цього транспорту.
 * @param {string} options.filename - Шаблон імені файлу логів (наприклад, 'combined/combined-%DATE%.log').
 * @param {winston.Format} options.format - Формат логів для цього транспорту.
 * @param {winston.Format} [options.filter] - Опціональний фільтр для логів.
 * @param {string} [options.maxSize='20m'] - Максимальний розмір файлу логів перед ротацією.
 * @param {string} [options.maxFiles='14d'] - Максимальна кількість файлів логів або термін їх зберігання.
 * @returns {winston.transports.DailyRotateFile} Транспорт Winston DailyRotateFile.
 */
const createFileTransport = (options) => {
    const { level, filename, format, filter, maxSize, maxFiles } = options
    // Визначаємо абсолютний шлях до папки логів
    // const logDir = path.resolve(__dirname, '../../logs') // Відносний шлях від 'src/logger' до 'logs'
    const logDir = path.resolve(process.cwd(), 'logs')
    return new winston.transports.DailyRotateFile({
        level,
        filename: path.join(logDir, filename),
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: maxSize || '20m',
        maxFiles: maxFiles || '14d',
        format: filter ? winston.format.combine(filter, format) : format,
    })
}

/**
 * Набір правил маскування за замовчуванням для чутливих даних.
 * @type {MaskingRule[]}
 */
const defaultMaskingRules = [
    { pattern: /password/i, excludePatterns: [], replaceWith: '[PASSWORD_HIDDEN]' },
    { pattern: /token/i, excludePatterns: [/token_source/i], replaceWith: '[TOKEN_HIDDEN]' },
    { pattern: /cvv/i, excludePatterns: [], replaceWith: '[CVV_MASKED]' },
    { pattern: /creditcard/i, excludePatterns: [], replaceWith: '[CREDIT_CARD_MASKED]' },
    { pattern: /apikey/i, excludePatterns: [], replaceWith: '[API_KEY_MASKED]' },
    { pattern: /secret/i, excludePatterns: [], replaceWith: '[SECRET_MASKED]' },
    { pattern: /ssn/i, excludePatterns: [], replaceWith: '[SSN_MASKED]' },
    // { pattern: /email/i, excludePatterns: [], replaceWith: '[EMAIL_MASKED]' },
    // { pattern: /phone/i, excludePatterns: [], replaceWith: '[PHONE_MASKED]' },
    // { pattern: /address/i, excludePatterns: [/ipAddress/i], replaceWith: '[ADDRESS_MASKED]' },
    // Додайте інші правила за потреби
]

/**
 * Клас-обгортка для основного екземпляра логера Winston.
 * Він розширює ILogger, щоб відповідати нашому абстрактному інтерфейсу,
 * використовуючи вже налаштований логер Winston.
 * @extends ILogger
 */
class WinstonLogger extends ILogger {
    /**
     * @private
     * @type {winston.Logger}
     */
    #winstonLogger

    /**
     * Створює екземпляр WinstonLogger.
     * Ініціалізує внутрішній логер Winston з усіма транспортами та форматами.
     * @param {object} [options={}] - Опції конфігурації, передані з LoggerFactory
     * @param {string} [options.level='info'] - Рівень логування за замовчуванням для Winston.
     */
    constructor(options = {}) {
        super()
        const { level = 'info' } = options

        /**
         * Основний екземпляр логера Winston, конфігурований з різними рівнями, форматами та транспортами.
         * Також обробляє необроблені винятки та відхилені проміси.
         * @type {winston.Logger}
         */
        this.#winstonLogger = winston.createLogger({
            levels: logLevels,
            level: level,
            defaultMeta: {
                service: 'main-service', // Назва сервісу, що додається до кожного логу
            },
            transports: [
                // Транспорт для консолі
                new winston.transports.Console({
                    format: getLogFormat(true, defaultMaskingRules), // Використовуємо формат для консолі з маскуванням
                    handleExceptions: true, // Обробляти необроблені винятки
                    handleRejections: true, // Обробляти відхилені проміси
                }),
                // Транспорт для всіх логів у файл
                createFileTransport({
                    filename: 'combined/combined-%DATE%.log',
                    format: getLogFormat(false, defaultMaskingRules), // Використовуємо JSON формат для файлів з маскуванням
                }),
                // Транспорт для логів помилок у окремий файл
                createFileTransport({
                    level: 'error',
                    filename: 'errors/error-%DATE%.log',
                    format: getLogFormat(false, defaultMaskingRules),
                    filter: createLevelFilter('error'), // Фільтрувати лише помилки
                }),
            ],
            // Обробники для необроблених винятків
            exceptionHandlers: [
                createFileTransport({
                    level: 'error',
                    filename: 'exceptions/exceptions-%DATE%.log',
                    format: getLogFormat(false, defaultMaskingRules), // Використовуємо JSON формат з маскуванням
                }),
            ],
            // Обробники для відхилених промісів
            rejectionHandlers: [
                createFileTransport({
                    level: 'error',
                    filename: 'rejections/rejections-%DATE%.log',
                    format: getLogFormat(false, defaultMaskingRules), // Використовуємо JSON формат з маскуванням
                }),
            ],
            exitOnError: false, // Не виходити з процесу в разі необроблених помилок (продовжувати роботу)
        })
    }

    /**
     * Логує загальне повідомлення через Winston (як `info`).
     * @param {string} message - Повідомлення для логування.
     * @param {...any} args - Додаткові аргументи для Winston.
     */
    log(message, ...args) {
        this.#winstonLogger.info(message, ...args)
    }

    /**
     * Логує інформаційне повідомлення через Winston.
     * @param {string} message - Інформаційне повідомлення.
     * @param {...any} args - Додаткові аргументи для Winston.
     */
    info(message, ...args) {
        this.#winstonLogger.info(message, ...args)
    }

    /**
     * Логує попередження через Winston.
     * @param {string} message - Повідомлення попередження.
     * @param {...any} args - Додаткові аргументи для Winston.
     */
    warn(message, ...args) {
        this.#winstonLogger.warn(message, ...args)
    }

    /**
     * Логує повідомлення про помилку через Winston.
     * @param {string} message - Повідомлення про помилку.
     * @param {...any} args - Додаткові аргументи для Winston.
     */
    error(message, ...args) {
        this.#winstonLogger.error(message, ...args)
    }

    /**
     * Логує налагоджувальне повідомлення через Winston.
     * @param {string} message - Налагоджувальне повідомлення.
     * @param {...any} args - Додаткові аргументи для Winston.
     */
    debug(message, ...args) {
        this.#winstonLogger.debug(message, ...args)
    }

    /**
     * Логує HTTP-повідомлення через Winston.
     * @param {string} message - HTTP-повідомлення.
     * @param {...any} args - Додаткові аргументи для Winston.
     */
    http(message, ...args) {
        this.#winstonLogger.http(message, ...args)
    }

    /**
     * Логує докладні повідомлення через Winston.
     * @param {string} message - Докладне повідомлення.
     * @param {...any} args - Додаткові аргументи для Winston.
     */
    verbose(message, ...args) {
        this.#winstonLogger.verbose(message, ...args)
    }

    /**
     * Логує дуже докладні повідомлення (silly) через Winston.
     * @param {string} message - Дуже докладне повідомлення.
     * @param {...any} args - Додаткові аргументи для Winston.
     */
    silly(message, ...args) {
        this.#winstonLogger.silly(message, ...args)
    }

    /**
     * Фабрика для створення дочірніх логерів.
     * Дочірні логери успадковують конфігурацію від батьківського логера,
     * але можуть мати додаткові метадані (наприклад, назву сервісу).
     *
     * @param {string} serviceName - Назва сервісу, яка буде додана до метаданих логів.
     * @returns {winston.Logger} Дочірній екземпляр логера.
     */
    getLoggerForService(serviceName) {
        return this.#winstonLogger.child({ service: serviceName })
    }
}

export default WinstonLogger
