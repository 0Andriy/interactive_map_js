import ILogger from './ILogger.js'

/**
 * FileLogger: Стратегія для виведення логів у файл.
 * @implements {ILogger}
 */
export class FileLogger {
    log(message, ...args) {
        console.log(`[File Write] LOG: ${message}`, ...args)
    }
    info(message, ...args) {
        console.log(`[File Write] INFO: ${message}`, ...args)
    }
    warn(message, ...args) {
        console.log(`[File Write] WARN: ${message}`, ...args)
    }
    error(message, ...args) {
        console.log(`[File Write] ERROR: ${message}`, ...args)
    }
}
