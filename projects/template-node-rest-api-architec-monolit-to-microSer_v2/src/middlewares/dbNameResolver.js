import config from '../config/config.js'
import logger from '../utils/logger.js'

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
const dbNameResolver = (req, res, next) => {
    try {
        const { dbName } = req.query // Деструктуризація для отримання dbName з req.query

        if (dbName) {
            req.dbName = dbName
            logger.info(`[dbNameResolver] Використано dbName з query-параметрів: ${req.dbName}`)
        } else {
            req.dbName = config.oracleDB.defaultDbName
            logger.info(`[dbNameResolver] Використано дефолтний dbName: ${req.dbName}`)
        }

        next() // Передача управління наступному middleware/обробнику маршруту
    } catch (error) {
        // Логуємо помилку за допомогою Winston
        logger.error(`[dbNameResolver] Помилка під час визначення dbName: ${error.message}`, error)

        // Передаємо помилку далі по ланцюжку middleware для централізованої обробки помилок
        // Це важливо, щоб користувач отримав відповідь про помилку, а не просто "завис" запит.
        next(error)
    }
}

export default dbNameResolver
