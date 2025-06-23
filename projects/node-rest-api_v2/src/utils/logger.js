import winston from 'winston' // Логер
import 'winston-daily-rotate-file' // Плагін для ротації файлів Winston
import path from 'path' // Модуль для роботи з шляхами файлової системи
import { AsyncLocalStorage } from 'async_hooks' // Модуль для збереження контексту в асинхронних операціях
import config from '../config/config.js' // Конфігураційний файл застосунку

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
 */

/**
 * Маскує чутливі поля в об'єкті або масиві об'єктів на будь-якій глибині.
 * Використовує надані правила маскування для заміни значень.
 *
 * @param {object|Array} data - Об'єкт або масив, що потенційно містить чутливі дані.
 * @param {MaskingRule[]} maskingRules - Масив об'єктів з правилами маскування (регулярний вираз та рядок заміни).
 * @returns {object|Array} Копія об'єкта/масиву з маскованими чутливими полями.
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
 * @returns {winston.transports.DailyRotateFile} Транспорт Winston DailyRotateFile.
 */
const createFileTransport = (options) => {
    const { level, filename, format, filter, maxSize, maxFiles } = options
    // Визначаємо абсолютний шлях до папки логів
    const logDir = path.resolve(__dirname, '../../logs')
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
    { pattern: /token/i, excludePatterns: [], replaceWith: '[TOKEN_HIDDEN]' },
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
 * Основний екземпляр логера Winston.
 * Конфігурується з різними рівнями, форматами та транспортами для консолі та файлів.
 * Також обробляє необроблені винятки та відхилені проміси.
 * @type {winston.Logger}
 */
const logger = winston.createLogger({
    levels: logLevels,
    level: config.loggerLevel || 'info', // Рівень логування за замовчуванням з конфігу або 'info'
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

/**
 * Експорт основного логера для використання в інших модулях.
 */
export default logger

/**
 * Фабрика для створення дочірніх логерів.
 * Дочірні логери успадковують конфігурацію від батьківського логера,
 * але можуть мати додаткові метадані (наприклад, назву сервісу).
 *
 * @param {string} serviceName - Назва сервісу, яка буде додана до метаданих логів.
 * @returns {winston.Logger} Дочірній екземпляр логера.
 */
export const getLoggerForService = (serviceName) => logger.child({ service: serviceName })
