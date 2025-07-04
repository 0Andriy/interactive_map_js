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
    constructor() {
        super()
        /**
         * Префікс для всіх повідомлень, що виводяться цим логером.
         * @type {string}
         */
        this.prefix = '[ConsoleLogger]'
    }

    /**
     * Допоміжний метод для форматування повідомлення.
     * @private
     * @param {string} level - Рівень логування (наприклад, 'debug', 'info').
     * @param {string} message - Основне повідомлення.
     * @param {...any} args - Додаткові аргументи.
     * @returns {Array<any>} Масив аргументів для `console.log` або `console.error`.
     */
    _formatMessage(level, message, ...args) {
        const time = new Date().toISOString()
        // Використовуємо %o для об'єктів, щоб console їх правильно розширювала
        const formattedMessage = `${this.prefix} [${time}] [${level.toUpperCase()}] ${message}`

        // Якщо є додаткові аргументи, додаємо їх до масиву
        if (args.length > 0) {
            return [formattedMessage, ...args]
        }
        return [formattedMessage]
    }

    /**
     * Логує загальне повідомлення в консоль.
     * @param {string} message - Повідомлення для логування.
     * @param {...any} args - Додаткові аргументи для `console.log`.
     */
    log(message, ...args) {
        console.debug(...this._formatMessage('log', message, ...args))
    }

    /**
     * Логує інформаційне повідомлення в консоль.
     * @param {string} message - Інформаційне повідомлення.
     * @param {...any} args - Додаткові аргументи для `console.info`.
     */
    info(message, ...args) {
        console.debug(...this._formatMessage('info', message, ...args))
    }

    /**
     * Логує попередження в консоль.
     * @param {string} message - Повідомлення попередження.
     * @param {...any} args - Додаткові аргументи для `console.warn`.
     */
    warn(message, ...args) {
        console.debug(...this._formatMessage('warn', message, ...args))
    }

    /**
     * Логує повідомлення про помилку в консоль.
     * @param {string} message - Повідомлення про помилку.
     * @param {...any} args - Додаткові аргументи для `console.error`.
     */
    error(message, ...args) {
        console.debug(...this._formatMessage('error', message, ...args))
    }

    /**
     * Логує налагоджувальне повідомлення в консоль.
     * @param {string} message - Налагоджувальне повідомлення.
     * @param {...any} args - Додаткові аргументи для `console.debug`.
     */
    debug(message, ...args) {
        console.debug(...this._formatMessage('debug', message, ...args))
    }

    /**
     * Логує HTTP-повідомлення в консоль.
     * Для ConsoleLogger це просто обгортка над `console.log`.
     * @param {string} message - HTTP-повідомлення.
     * @param {...any} args - Додаткові аргументи.
     */
    http(message, ...args) {
        console.debug(...this._formatMessage('http', message, ...args))
    }

    /**
     * Логує докладні повідомлення (verbose) в консоль.
     * Для ConsoleLogger це просто обгортка над `console.debug`.
     * @param {string} message - Докладне повідомлення.
     * @param {...any} args - Додаткові аргументи.
     */
    verbose(message, ...args) {
        console.debug(...this._formatMessage('verbose', message, ...args))
    }

    /**
     * Логує дуже докладні повідомлення (silly) в консоль.
     * Для ConsoleLogger це просто обгортка над `console.debug`.
     * @param {string} message - Дуже докладне повідомлення.
     * @param {...any} args - Додаткові аргументи.
     */
    silly(message, ...args) {
        console.debug(...this._formatMessage('silly', message, ...args))
    }

    /**
     * Фабрика для створення дочірніх логерів.
     * Для ConsoleLogger це просто повернення нового екземпляра ConsoleLogger
     * з оновленим префіксом, що імітує дочірній логер.
     * @param {string} serviceName - Назва сервісу, яка буде додана до метаданих логів.
     * @returns {ILogger} Дочірній екземпляр логера.
     */
    getLoggerForService(serviceName) {
        const childLogger = new ConsoleLogger()
        childLogger.prefix = `${this.prefix}[${serviceName}]`
        return childLogger
    }
}

export default ConsoleLogger
