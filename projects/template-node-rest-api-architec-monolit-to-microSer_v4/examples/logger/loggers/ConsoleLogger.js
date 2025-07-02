import IBaseLogger from '../IBaseLogger.js'

/**
 * Консольний логер
 * Патерн: Strategy Implementation
 */
export default class ConsoleLogger extends IBaseLogger {
    log(level, message, meta) {
        const time = new Date().toISOString()
        console.log(`[${time}] [${level.toUpperCase()}] ${message}`, meta || '')
    }
}
