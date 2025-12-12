import { ConsoleLogger } from './Strategies/ConsoleLogger.js'
import { FileLogger } from './Strategies/FileLogger.js'

/**
 * LogManager керує активним логером і забезпечує єдину точку доступу (Singleton logic handled in index.js).
 */
export class LogManager {
    constructor() {
        // За замовчуванням використовуємо ConsoleLogger
        this.activeLogger = new ConsoleLogger()
    }

    /**
     * Перемикає поточну стратегію логування.
     * @param {'console' | 'file'} type - Тип логера, який потрібно активувати.
     */
    setLoggerType(type) {
        switch (type) {
            case 'console':
                this.activeLogger = new ConsoleLogger()
                console.log('Логер перемкнено на ConsoleLogger.')
                break
            case 'file':
                this.activeLogger = new FileLogger()
                console.log('Логер перемкнено на FileLogger.')
                break
            default:
                console.warn(`Невідомий тип логера: ${type}. Залишено ConsoleLogger.`)
        }
    }

    // Делегуємо всі виклики методів активному логеру
    log(m, ...a) {
        this.activeLogger.log(m, ...a)
    }
    info(m, ...a) {
        this.activeLogger.info(m, ...a)
    }
    warn(m, ...a) {
        this.activeLogger.warn(m, ...a)
    }
    error(m, ...a) {
        this.activeLogger.error(m, ...a)
    }
}
