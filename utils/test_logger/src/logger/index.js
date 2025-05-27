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














// src/logger/index.js

import consoleLogger from './consoleLogger.js';
import winstonLogger from './winstonLogger.js';

const LOG_PROVIDER = process.env.LOG_PROVIDER || 'console';

let logger;

switch (LOG_PROVIDER.toLowerCase()) {
  case 'winston':
    logger = winstonLogger;
    break;
  case 'console':
  default:
    logger = consoleLogger;
    break;
}

export default logger;
