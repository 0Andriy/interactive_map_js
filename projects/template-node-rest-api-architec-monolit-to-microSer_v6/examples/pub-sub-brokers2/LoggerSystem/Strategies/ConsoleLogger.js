// LoggerSystem/Strategies/ConsoleLogger.js
import ILogger from './ILogger.js'

/**
 * ConsoleLogger: Стратегія для виведення логів у консоль.
 * @implements {ILogger}
 */
export class ConsoleLogger {
    log(message, ...args) {
        console.log(`[LOG] ${message}`, ...args)
    }
    info(message, ...args) {
        console.info(`[INFO] ${message}`, ...args)
    }
    warn(message, ...args) {
        console.warn(`[WARN] ${message}`, ...args)
    }
    error(message, ...args) {
        console.error(`[ERROR] ${message}`, ...args)
    }
}
