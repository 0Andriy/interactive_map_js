/**
 * @interface ILogger Інтерфейс, який описує методи логування.
 */
class ILogger {
    log(message, ...args) {}
    info(message, ...args) {}
    warn(message, ...args) {}
    error(message, ...args) {}
}

export default ILogger
