import { getLogger } from './LoggerRegistry.js'

/**
 * Менеджер логування з підтримкою переключення
 * Патерн: Context
 */
export default class LoggerManager {
    constructor() {
        this.currentLoggerName = null
        this.currentLogger = null
    }

    /**
     * Встановити активний логер
     * @param {string} name
     */
    setLogger(name) {
        this.currentLoggerName = name
        this.currentLogger = getLogger(name)
    }

    /**
     * Логування повідомлення
     * @param {string} level
     * @param {string} message
     * @param {Object} [meta]
     */
    log(level, message, meta) {
        if (!this.currentLogger) {
            throw new Error('Logger is not set')
        }

        if (typeof this.currentLogger[level] === 'function') {
            this.currentLogger[level](message, meta)
        } else {
            this.currentLogger.log('info', message, meta)
        }
    }

    info(message, meta) {
        this.log('info', message, meta)
    }

    error(message, meta) {
        this.log('error', message, meta)
    }

    warn(message, meta) {
        this.log('warn', message, meta)
    }

    debug(message, meta) {
        this.log('debug', message, meta)
    }
}
