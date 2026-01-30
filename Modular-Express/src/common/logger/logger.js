import config from '../../config/config.js'
import { ConsoleLogger } from './ConsoleLogger.js'
import { WinstonLogger } from './WinstonLogger.js'

function createLogger() {
    const type = config.logger.type || 'console'
    const level = config.logger.level || 'debug'

    switch (type) {
        case 'winston':
            return new WinstonLogger(level)
        case 'console':
        default:
            return new ConsoleLogger(level)
    }
}

// Експортуємо готовий екземпляр (Singleton)
export const logger = createLogger()
export default logger
