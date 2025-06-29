import IBaseLogger from './IBaseLogger.js'

/**
 * @type {Map<string, () => IBaseLogger>}
 */
const loggers = new Map()

/**
 * Реєструє логер.
 * @param {string} name
 * @param {() => IBaseLogger} factoryFn
 */
export function registerLogger(name, factoryFn) {
    loggers.set(name, factoryFn)
}

/**
 * Повертає інстанс логера за назвою.
 * @param {string} name
 * @returns {IBaseLogger}
 */
export function getLogger(name) {
    const factory = loggers.get(name)
    if (!factory) throw new Error(`Logger not found: ${name}`)
    return factory()
}
