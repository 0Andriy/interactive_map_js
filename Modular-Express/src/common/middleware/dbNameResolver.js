import config from '../../config/config.js'
import logger from '../logger/logger.js'
import { CustomError } from '../utils/CustomError.js'

/**
 * Middleware для визначення назви бази даних.
 *
 * Він перевіряє `dbName` у query-параметрах запиту (`req.query.dbName`).
 * Якщо `dbName` знайдено, воно використовується. В іншому випадку,
 * встановлюється дефолтне значення з конфігурації (`config.defaultDbName`).
 * Отримане ім'я бази даних зберігається у `req.dbName` для подальшого використання.
 *
 * @param {object} req - Об'єкт запиту Express.
 * @param {object} res - Об'єкт відповіді Express.
 * @param {function} next - Функція для передачі управління наступному middleware.
 */
export const dbNameResolver = (req, res, next) => {
    const allowedDatabases = config.oracleDB.availableDatabases

    // 1. Визначаємо назву (пріоритет: query -> config)
    const dbName = req.query.dbName || config.oracleDB.primaryDatabaseName

    if (!allowedDatabases.includes(dbName)) {
        // Використовуємо наш CustomError!
        return next(CustomError.BadRequest(`Invalid database name: ${dbName}`))
    }

    // 2. Зберігаємо в об'єкт запиту
    req.dbName = dbName

    // 3. Синхронізуємо з нашим глобальним контекстом (для логів)
    if (req.context) {
        req.context.dbName = dbName
    }

    // Логуємо лише на рівні 'debug' або взагалі не логуємо тут,
    // оскільки dbName автоматично з'явиться в кожному логу через AsyncLocalStorage
    logger?.debug?.(`[dbNameResolver] Selected database: ${dbName}`, { dbName })

    next()
}

export default dbNameResolver
