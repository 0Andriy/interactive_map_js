// src/utils/logger/ILogger.js

/**
 * @fileoverview Абстрактний клас ILogger, що визначає єдиний інтерфейс для всіх логерів у системі.
 * Кожен конкретний логер (наприклад, ConsoleLogger, WinstonLogger) повинен розширювати цей клас
 * і реалізовувати всі його методи для забезпечення сумісності.
 */

/**
 * Абстрактний клас, який слугує контрактом (інтерфейсом) для всіх логерів.
 * Визначає стандартні методи для різних рівнів логування та функціонал для дочірніх логерів.
 * @abstract
 */
class ILogger {
    /**
     * Загальний метод для логування повідомлень.
     * Повинен бути реалізований у дочірніх класах.
     * @param {string} message - Повідомлення для логування.
     * @param {...any} args - Додаткові аргументи для логування (об'єкти, масиви тощо).
     * @throws {Error} Якщо метод не реалізований у дочірньому класі.
     */
    log(message, ...args) {
        throw new Error('Method "log" must be implemented')
    }

    /**
     * Логування інформаційних повідомлень.
     * Повинен бути реалізований у дочірніх класах.
     * @param {string} message - Інформаційне повідомлення.
     * @param {...any} args - Додаткові аргументи.
     * @throws {Error} Якщо метод не реалізований у дочірньому класі.
     */
    info(message, ...args) {
        throw new Error('Method "info" must be implemented')
    }

    /**
     * Логування попереджень.
     * Повинен бути реалізований у дочірніх класах.
     * @param {string} message - Повідомлення попередження.
     * @param {...any} args - Додаткові аргументи.
     * @throws {Error} Якщо метод не реалізований у дочірньому класі.
     */
    warn(message, ...args) {
        throw new Error('Method "warn" must be implemented')
    }

    /**
     * Логування повідомлень про помилки.
     * Повинен бути реалізований у дочірніх класах.
     * @param {string} message - Повідомлення про помилку.
     * @param {...any} args - Додаткові аргументи.
     * @throws {Error} Якщо метод не реалізований у дочірньому класі.
     */
    error(message, ...args) {
        throw new Error('Method "error" must be implemented')
    }

    /**
     * Логування налагоджувальних повідомлень (для розробки).
     * Повинен бути реалізований у дочірніх класах.
     * @param {string} message - Налагоджувальне повідомлення.
     * @param {...any} args - Додаткові аргументи.
     * @throws {Error} Якщо метод не реалізований у дочірньому класі.
     */
    debug(message, ...args) {
        throw new Error('Method "debug" must be implemented')
    }

    /**
     * Логування HTTP-запитів та відповідей.
     * Повинен бути реалізований у дочірніх класах.
     * @param {string} message - HTTP-повідомлення.
     * @param {...any} args - Додаткові аргументи.
     * @throws {Error} Якщо метод не реалізований у дочірньому класі.
     */
    http(message, ...args) {
        throw new Error('Method "http" must be implemented')
    }

    /**
     * Логування докладних повідомлень.
     * Повинен бути реалізований у дочірніх класах.
     * @param {string} message - Докладне повідомлення.
     * @param {...any} args - Додаткові аргументи.
     * @throws {Error} Якщо метод не реалізований у дочірньому класі.
     */
    verbose(message, ...args) {
        throw new Error('Method "verbose" must be implemented')
    }

    /**
     * Логування дуже докладних повідомлень.
     * Повинен бути реалізований у дочірніх класах.
     * @param {string} message - Дуже докладне повідомлення.
     * @param {...any} args - Додаткові аргументи.
     * @throws {Error} Якщо метод не реалізований у дочірньому класі.
     */
    silly(message, ...args) {
        throw new Error('Method "silly" must be implemented')
    }

    /**
     * Створює дочірній логер, що може бути використаний для логування з додатковими,
     * специфічними для модуля/сервісу метаданими.
     * Повинен бути реалізований у дочірніх класах.
     * @param {string} serviceName - Назва сервісу або модуля, яка буде додана до метаданих логів.
     * @returns {ILogger} Екземпляр дочірнього логера, що також реалізує ILogger.
     * @throws {Error} Якщо метод не реалізований у дочірньому класі.
     */
    getLoggerForService(serviceName) {
        throw new Error('Method "getLoggerForService" must be implemented')
    }
}

export default ILogger
