// app.js

import logger, { setLogger } from './logger/index.js'
import WinstonLogger from './logger/winstonLogger.js'

// Замінюємо логер
// setLogger(WinstonLogger);


logger.info('Новий запит', { method: 'GET', path: '/api/products' })
logger.error('Помилка при збереженні', { errorCode: 500, detail: 'DB error' })
logger.info('Сервер запущено')
logger.warn('Попередження: щось дивне')
logger.error('Помилка:', { code: 500, message: 'DB Error' })
logger.debug('Деталі запиту', { path: '/api', query: {} })

const authLogger = logger.createLogger('Auth')
const userServiceLogger = logger.createLogger('UserService')
const veryLongContextLogger = logger.createLogger('SuperMegaImportantController')

authLogger.info('Успішна авторизація')
userServiceLogger.warn('Користувача не знайдено')
veryLongContextLogger.error('Фатальна помилка', { code: 500 })

logger.info('Без контексту')
logger.error('Щось пішло не так')

const userLogger = logger.createLogger('UserService')
userLogger.debug('Отримано користувача')
