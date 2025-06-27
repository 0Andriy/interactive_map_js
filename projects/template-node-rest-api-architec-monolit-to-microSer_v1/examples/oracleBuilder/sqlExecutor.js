// core/sqlExecutor.js

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000 // Початкова затримка 1 секунда

/**
 * Виконує одну SQL-операцію з можливістю повторних спроб та обробкою помилок.
 * @param {string} dbName - Назва з'єднання з базою даних.
 * @param {object} operation - Об'єкт операції, створений `createOperation`.
 * @param {object} logger - Об'єкт логера (з методами info, warn, error).
 * @param {object} oracleDbManager - Об'єкт для взаємодії з базою даних Oracle.
 */
async function executeSqlOperation(dbName, operation, logger, oracleDbManager) {
    const {
        name,
        sql,
        type,
        existsErrorCode,
        successMessage,
        existsMessage,
        errorMessage,
        critical,
    } = operation

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            // Виконання SQL-запиту
            await oracleDbManager.execute(dbName, sql)
            logger.info(successMessage.replace('{name}', name.toUpperCase()))
            return // Операція успішно виконана, виходимо
        } catch (error) {
            // Перевірка, чи це помилка "об'єкт вже існує"
            if (existsErrorCode && error.oracleErrorNum === existsErrorCode) {
                logger.warn(existsMessage.replace('{name}', name.toUpperCase()))
                return // Об'єкт вже існує, це не вважається помилкою, продовжуємо
            }

            // Логування помилки
            logger.error(
                errorMessage
                    .replace('{name}', name.toUpperCase())
                    .replace('{message}', error.message),
                { error, attempt: attempt, maxAttempts: MAX_RETRIES },
            )

            // Логіка повторних спроб для критичних помилок
            if (critical && attempt < MAX_RETRIES) {
                logger.warn(`Retrying operation '${name}' (Attempt ${attempt}/${MAX_RETRIES})...`)
                // Експоненційна затримка: 1с, 2с, 4с...
                await new Promise((resolve) =>
                    setTimeout(resolve, RETRY_DELAY_MS * Math.pow(2, attempt - 1)),
                )
            } else if (critical && attempt === MAX_RETRIES) {
                // Якщо помилка критична і вичерпано всі спроби, кидаємо її далі
                throw error
            } else {
                // Якщо помилка некритична (critical: false), просто логуємо і продовжуємо
                return
            }
        }
    }
}

/**
 * Виконує послідовно масив SQL-операцій.
 * @param {string} dbName - Назва з'єднання з базою даних.
 * @param {Array<object>} operations - Масив об'єктів операцій для виконання.
 * @param {object} logger - Об'єкт логера.
 * @param {object} oracleDbManager - Об'єкт для взаємодії з базою даних Oracle.
 */
export async function runSchemaOperations(dbName, operations, logger, oracleDbManager) {
    for (const operation of operations) {
        await executeSqlOperation(dbName, operation, logger, oracleDbManager)
    }
}
