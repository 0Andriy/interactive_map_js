// logger.js

const defaultLogger = {
    log: console.log, // додаємо log
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
}

let currentLogger = defaultLogger

module.exports = {
    setLogger: (customLogger) => {
        currentLogger = {
            ...defaultLogger,
            ...customLogger,
        }
    },
    logger: {
        log: (...args) => currentLogger.log(...args),
        info: (...args) => currentLogger.info(...args),
        warn: (...args) => currentLogger.warn(...args),
        error: (...args) => currentLogger.error(...args),
        debug: (...args) => currentLogger.debug(...args),
    },
}

// logger/index.js
let currentLogger = {
    log: (...args) => console.log(...args),
    info: (...args) => console.info(...args),
    warn: (...args) => console.warn(...args),
    error: (...args) => console.error(...args),
    debug: (...args) => console.debug(...args),
}

export const setLogger = (customLogger = {}) => {
    currentLogger = {
        ...currentLogger,
        ...customLogger,
    }
}

export const logger = {
    log: (...args) => currentLogger.log(...args),
    info: (...args) => currentLogger.info(...args),
    warn: (...args) => currentLogger.warn(...args),
    error: (...args) => currentLogger.error(...args),
    debug: (...args) => currentLogger.debug(...args),
}

// logger/index.js
let currentLogger = console

export const setLogger = (newLogger = {}) => {
    currentLogger = {
        ...console,
        ...newLogger, // перекриває console методи, якщо є
    }
}

export const logger = new Proxy(
    {},
    {
        get: (_, prop) => {
            return (...args) => {
                const fn = currentLogger[prop]
                if (typeof fn === 'function') {
                    return fn(...args)
                } else {
                    throw new Error(`Logger method "${prop}" is not a function`)
                }
            }
        },
    },
)
