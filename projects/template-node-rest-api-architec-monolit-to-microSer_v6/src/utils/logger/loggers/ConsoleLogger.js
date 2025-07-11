// src/utils/logger/ConsoleLogger.js

/**
 * @fileoverview Реалізація логера, що виводить повідомлення в консоль.
 * Розширює абстрактний клас ILogger, забезпечуючи сумісність з розширеними рівнями логування Winston.
 */

import ILogger from './ILogger.js'

/**
 * Конкретна реалізація логера, яка виводить повідомлення в стандартну консоль.
 * Забезпечує реалізацію всіх методів, визначених в ILogger, а також додаткових рівнів,
 * присутніх у WinstonLogger, щоб уникнути помилок при перемиканні логерів.
 * @extends ILogger
 */
class ConsoleLogger extends ILogger {
    /**
     * Створює екземпляр ConsoleLogger.
     */
    constructor(prefix = '', level = 'debug') {
        super()

        /**
         * Константа для ієрархії рівнів
         * @type {object}
         */
        this.LOG_LEVELS = {
            log: 0,
            error: 0,
            warn: 1,
            info: 2,
            http: 3,
            verbose: 4,
            debug: 5,
            silly: 6,
        }

        /**
         * Об'єкт CONSOLE_METHODS визначено для кожного нового екземпляра
         * для оптимізації можна винести вище за межі класа для визначеня один раз на рівні модуля
         * @type {object}
         */
        this.CONSOLE_METHODS = {
            log: console.log,
            error: console.error,
            warn: console.warn,
            info: console.info,
            http: console.info,
            verbose: console.debug,
            debug: console.debug,
            silly: console.debug,
        }

        /**
         * Бажаний рівень логування
         */
        this.level = this.LOG_LEVELS[level] || this.LOG_LEVELS.info

        /**
         * Префікс для всіх повідомлень, що виводяться цим логером.
         * @type {string}
         */
        this.prefix = prefix
    }

    /**
     * Допоміжний метод для форматування повідомлення.
     * @private
     * @param {string} level - Рівень логування (наприклад, 'debug', 'info').
     * @param {string} message - Основне повідомлення.
     * @param {...any} args - Додаткові аргументи.
     * @returns {Array<any>} Масив аргументів для `console.log` або `console.error`.
     */
    // Допоміжний метод для вибору правильного методу console
    _log(level, message, ...args) {
        // Логіка філтрації
        const messageLevel = this.LOG_LEVELS[level]
        if (messageLevel === undefined || messageLevel > this.level) {
            return // Не виводимо повідомлення, якщо його рівень вищий
        }

        const time = new Date().toISOString()
        const prefix = this.prefix ? `[${this.prefix}]` : ''
        const formattedMessage = `${time} [${level.toUpperCase()}]${prefix} ${message}`

        // Вибираємо метод або використовуємо console.log за замовчуванням
        const consoleMethod = this.CONSOLE_METHODS[level] || console.log

        // Розгортаємо масив для виклику
        consoleMethod(formattedMessage, ...args)
    }

    /**
     * Логує загальне повідомлення в консоль.
     * @param {string} message - Повідомлення для логування.
     * @param {...any} args - Додаткові аргументи для `console.log`.
     */
    log(message, ...args) {
        this._log('log', message, ...args)
    }

    /**
     * Логує інформаційне повідомлення в консоль.
     * @param {string} message - Інформаційне повідомлення.
     * @param {...any} args - Додаткові аргументи для `console.info`.
     */
    info(message, ...args) {
        this._log('info', message, ...args)
    }

    /**
     * Логує налагоджувальне повідомлення в консоль.
     * @param {string} message - Налагоджувальне повідомлення.
     * @param {...any} args - Додаткові аргументи для `console.debug`.
     */
    debug(message, ...args) {
        this._log('debug', message, ...args)
    }

    /**
     * Логує попередження в консоль.
     * @param {string} message - Повідомлення попередження.
     * @param {...any} args - Додаткові аргументи для `console.warn`.
     */
    warn(message, ...args) {
        this._log('warn', message, ...args)
    }

    /**
     * Логує повідомлення про помилку в консоль.
     * @param {string} message - Повідомлення про помилку.
     * @param {...any} args - Додаткові аргументи для `console.error`.
     */
    error(message, ...args) {
        this._log('error', message, ...args)
    }

    /**
     * Логує HTTP-повідомлення в консоль.
     * Для ConsoleLogger це просто обгортка над `console.log`.
     * @param {string} message - HTTP-повідомлення.
     * @param {...any} args - Додаткові аргументи.
     */
    http(message, ...args) {
        this._log('http', message, ...args)
    }

    /**
     * Логує докладні повідомлення (verbose) в консоль.
     * Для ConsoleLogger це просто обгортка над `console.debug`.
     * @param {string} message - Докладне повідомлення.
     * @param {...any} args - Додаткові аргументи.
     */
    verbose(message, ...args) {
        this._log('verbose', message, ...args)
    }

    /**
     * Логує дуже докладні повідомлення (silly) в консоль.
     * Для ConsoleLogger це просто обгортка над `console.debug`.
     * @param {string} message - Дуже докладне повідомлення.
     * @param {...any} args - Додаткові аргументи.
     */
    silly(message, ...args) {
        this._log('silly', message, ...args)
    }

    /**
     * Фабрика для створення дочірніх логерів.
     * Для ConsoleLogger це просто повернення нового екземпляра ConsoleLogger
     * з оновленим префіксом, що імітує дочірній логер.
     * @param {string} serviceName - Назва сервісу, яка буде додана до метаданих логів.
     * @returns {ILogger} Дочірній екземпляр логера.
     */
    getLoggerForService(serviceName) {
        const newPrefix = this.prefix ? `[${serviceName}] -> ${this.prefix}` : `[${serviceName}]`
        const childLogger = new ConsoleLogger(newPrefix)
        return childLogger
    }
}

//
export default ConsoleLogger
