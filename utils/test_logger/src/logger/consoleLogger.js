// logger.js

const levels = ['debug', 'info', 'warn', 'error']

const colors = {
    debug: '\x1b[90m',
    info: '\x1b[34m',
    warn: '\x1b[33m',
    error: '\x1b[31m',
}
const RESET = '\x1b[0m'

const LOG_LEVEL = levels.includes(process.env.LOG_LEVEL) ? process.env.LOG_LEVEL : 'debug'
const LOG_MODE = ['color', 'json'].includes(process.env.LOG_MODE) ? process.env.LOG_MODE : 'color'

const minLevel = levels.indexOf(LOG_LEVEL)
const getTimestamp = () => new Date().toISOString()//.replace('T', ' ').split('.')[0]
const shouldLog = (level) => levels.indexOf(level) >= minLevel

let maxContextLength = 0 // динамічно оновлюється

const pad = (str, len, padChar = ' ') => {
    const strLength = str.length
    if (strLength >= len) return str
    return str + padChar.repeat(len - strLength)
}

const formatArgsColor = (args) =>
    args.map((arg) => {
        if (typeof arg === 'object') {
            try {
                return JSON.stringify(arg, null, 2).slice(0, 500)
            } catch {
                return '[Object]'
            }
        }
        return String(arg)
    })

const formatArgsJson = (args) =>
    args.map((arg) => {
        if (typeof arg === 'object') return arg
        return { message: String(arg) }
    })

const createLogger = (context = '') => {
    if (context.length > maxContextLength) {
        maxContextLength = context.length
    }

    const contextLabel = context

    const log =
        (level) =>
        (...args) => {
            if (!shouldLog(level)) return

            const timestamp = getTimestamp()

            if (LOG_MODE === 'json') {
                const messages = formatArgsJson(args)
                const logEntry = {
                    level,
                    timestamp,
                    context,
                    messages,
                }
                console.log(JSON.stringify(logEntry))
            } else {
                // // Кольоровий режим
                // const color = colors[level] || ''
                // const prefix = `${color}${pad(level)}  ${timestamp}${RESET}`
                // const message = formatArgsColor(args).join(' ')
                // console.log(`${prefix} ${message}`)

                const color = colors[level] || ''
                const paddedLevel = `[${pad(level, 5)}]`
                const paddedContext = contextLabel ? `[${pad(contextLabel, maxContextLength)}]` : ''
                const formattedArgs = formatArgsColor(args).join(' ')
                const line = `${paddedLevel} ${timestamp} ${paddedContext} ${formattedArgs}`
                console.log(`${color}${line}${RESET}`)
            }
        }

    return {
        debug: log('debug'),
        info: log('info'),
        warn: log('warn'),
        error: log('error'),
    }
}

const defaultLogger = createLogger()

export { createLogger }
export default defaultLogger
