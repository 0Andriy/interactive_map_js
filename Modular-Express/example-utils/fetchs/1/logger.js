/**
 * Клас для логування з підтримкою контексту запитів та ієрархії.
 */
export class Logger {
    /**
     * @param {Object} [meta={}] - Початкові мета-дані (наприклад, назва сервісу).
     */
    constructor(meta = {}) {
        this.meta = meta
    }

    /**
     * Створює дочірній логер, успадковуючи мета-дані батька.
     * @param {Object} childMeta - Додаткові мета-дані.
     * @returns {Logger}
     */
    child(childMeta) {
        return new Logger({ ...this.meta, ...childMeta })
    }

    /**
     * Внутрішній метод для виводу логів.
     * @private
     */
    _log(level, message, data = {}) {
        const payload = {
            timestamp: new Date().toISOString(),
            level,
            message,
            ...this.meta,
            ...data,
        }
        const method = ['error', 'warn'].includes(level) ? level : 'log'
        console[method](
            `[${level.toUpperCase()}] [${this.meta.requestId || 'SYSTEM'}] ${message}`,
            data,
        )
    }

    error(msg, data) {
        this._log?.('error', msg, data)
    }
    warn(msg, data) {
        this._log?.('warn', msg, data)
    }
    info(msg, data) {
        this._log?.('info', msg, data)
    }
    http(msg, data) {
        this._log?.('http', msg, data)
    }
    debug(msg, data) {
        this._log?.('debug', msg, data)
    }
}
