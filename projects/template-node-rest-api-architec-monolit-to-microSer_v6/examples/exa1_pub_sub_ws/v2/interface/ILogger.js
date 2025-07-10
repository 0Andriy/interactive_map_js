/**
 * @interface ILogger
 * @description Інтерфейс для системи логування.
 */
class ILogger {
    log(message, ...args) {
        throw new Error("Method 'log()' must be implemented.")
    }
    warn(message, ...args) {
        throw new Error("Method 'warn()' must be implemented.")
    }
    error(message, ...args) {
        throw new Error("Method 'error()' must be implemented.")
    }
    debug(message, ...args) {
        throw new Error("Method 'debug()' must be implemented.")
    }
}

export { ILogger }
