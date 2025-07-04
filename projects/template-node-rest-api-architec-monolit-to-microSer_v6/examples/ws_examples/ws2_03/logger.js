// logger.js
export const logger = {
    info: (...args) =>
        console.log('\x1b[36m%s\x1b[0m', '[INFO]', new Date().toISOString(), ...args),
    debug: (...args) =>
        process.env.NODE_ENV !== 'production' &&
        console.log('\x1b[35m%s\x1b[0m', '[DEBUG]', new Date().toISOString(), ...args),
    warn: (...args) =>
        console.warn('\x1b[33m%s\x1b[0m', '[WARN]', new Date().toISOString(), ...args),
    error: (...args) =>
        console.error('\x1b[31m%s\x1b[0m', '[ERROR]', new Date().toISOString(), ...args),
}
