import LoggerManager from './logger/index.js'
import { registerLogger } from './logger/LoggerRegistry.js'
import ConsoleLogger from './logger/loggers/ConsoleLogger.js'
import WinstonLogger from './logger/loggers/WinstonLogger.js'

registerLogger('console', () => new ConsoleLogger())
registerLogger(
    'winston',
    () =>
        new WinstonLogger({
            config: {
                transports: [new (require('winston').transports.Console)()],
            },
        }),
)

const logger = new LoggerManager()

logger.setLogger('console')
logger.info('Hello from console logger')

logger.setLogger('winston')
logger.error('Hello from winston logger', { errorCode: 123 })
