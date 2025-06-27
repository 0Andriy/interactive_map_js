// src/utils/logger/LoggerFactory.js

/**
 * @fileoverview Фабричний клас для створення екземплярів різних типів логерів.
 * Використовує патерн "Фабричний метод" для інкапсуляції логіки створення об'єктів.
 */

import ConsoleLogger from './ConsoleLogger.js'
import WinstonLogger from './WinstonLogger.js' // Імпортуємо наш оновлений клас WinstonLogger
// Імпортуйте інші реалізації логерів тут

/**
 * Фабрика, яка створює та повертає екземпляри логерів на основі заданого типу.
 */
class LoggerFactory {
    /**
     * Створює та повертає екземпляр логера заданого типу.
     * @param {string} type - Тип логера, який потрібно створити (наприклад, 'console', 'winston').
     * @param {object} [options={}] - Об'єкт конфігурації, який буде переданий конструктору логера.
     * Корисний для передачі специфічних налаштувань (наприклад, для Winston).
     * @returns {ILogger} Екземпляр логера, що реалізує інтерфейс ILogger.
     * @throws {Error} Якщо вказано невідомий тип логера.
     */
    static createLogger(type, options = {}) {
        switch (type) {
            case 'console':
                return new ConsoleLogger()
            case 'winston':
                return new WinstonLogger(options.winston) // Створюємо екземпляр класу WinstonLogger
            // Додайте інші case для нових типів логерів
            default:
                throw new Error(`Unknown logger type: ${type}`)
        }
    }
}

export default LoggerFactory
