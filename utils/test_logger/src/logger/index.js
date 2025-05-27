// logger/index.js

import consoleLogger from './consoleLogger.js'

let logger = consoleLogger // може бути замінено на Winston або інший

export function setLogger(newLogger) {
    logger = newLogger
}

// export function createLogger(context) {
//     return logger.createLogger ? logger.createLogger(context) : logger
// }

// export default logger

// // export function info(...args) {
// //     logger.info(...args)
// // }

// // export function warn(...args) {
// //     logger.warn(...args)
// // }

// // export function error(...args) {
// //     logger.error(...args)
// // }

// // export function debug(...args) {
// //     logger.debug(...args)
// // }

const proxy = new Proxy(
    {},
    {
        get(target, prop) {
            if (prop === 'createLogger') return (ctx) => logger.createLogger(ctx)
            if (typeof logger[prop] === 'function') {
                return (...args) => logger[prop](...args)
            }
            return logger[prop]
        },
    },
)

export default proxy
