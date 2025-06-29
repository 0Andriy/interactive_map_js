/**
 * Абстрактний інтерфейс логера
 * Патерн: Strategy Interface
 */
export default class IBaseLogger {
    /**
     * @param {Object} deps - залежності (за потребою)
     */
    constructor(deps) {}

    /**
     * Основний метод логування.
     * @param {string} level - рівень: info, error, warn, debug
     * @param {string} message - повідомлення
     * @param {Object} [meta] - додаткові дані
     */
    log(level, message, meta) {
        throw new Error('Method "log" must be implemented')
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
