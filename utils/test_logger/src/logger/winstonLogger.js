// logger/winstonLogger.js
import winston from 'winston'

const createWinstonLogger = (context = '') => {
    const formatWithContext = winston.format((info) => {
        if (context) {
            info.context = context
        }
        return info
    })

    const logger = winston.createLogger({
        level: process.env.LOG_LEVEL || 'debug',
        format: winston.format.combine(
            formatWithContext(),
            winston.format.timestamp(),
            winston.format.printf(({ timestamp, level, message, context }) => {
                const contextStr = context ? `[${context}]` : ''
                return `[${level.toUpperCase()}] ${timestamp} ${contextStr} ${message}`
            }),
        ),
        transports: [
            new winston.transports.Console(),
            // Якщо потрібно, додаємо логування у файл:
            // new winston.transports.File({ filename: 'app.log' }),
        ],
    })

    return {
        debug: (...args) => logger.debug(args.map(String).join(' ')),
        info: (...args) => logger.info(args.map(String).join(' ')),
        warn: (...args) => logger.warn(args.map(String).join(' ')),
        error: (...args) => logger.error(args.map(String).join(' ')),
    }
}

// За замовчуванням — логер без контексту
const defaultLogger = createWinstonLogger()

export default {
    ...defaultLogger,
    createLogger: createWinstonLogger,
}
