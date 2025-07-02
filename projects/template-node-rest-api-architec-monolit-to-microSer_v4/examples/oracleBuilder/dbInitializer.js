// dbInitializer.js

import { schemaDefinitions } from './oracleSchema.js' //'./schema/oracleSchema.js'
import { buildSchemaOperations } from './oracleGenerators.js' //'./sql/oracleGenerators.js'
import { runSchemaOperations } from './sqlExecutor.js' //'./core/sqlExecutor.js'

// --- Приклад мок-реалізацій для демонстрації ---
// В реальному проекті ви повинні замінити їх на ваші фактичні модулі для роботи з Oracle та логування.

/**
 * Мок-об'єкт для імітації менеджера Oracle DB.
 * Імітує виконання SQL-запитів та певні помилки для тестування логіки.
 */
const mockOracleDbManager = {
    /**
     * Імітує виконання SQL-запиту.
     * @param {string} dbName - Назва БД.
     * @param {string} sql - SQL-запит для виконання.
     * @returns {Promise<object>} Результат виконання (імітований).
     * @throws {Error} Імітує помилки для тестування.
     */
    execute: async (dbName, sql) => {
        // Імітуємо затримку для асинхронності
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 100 + 50))

        // --- Імітація помилок для тестування ---
        // Імітуємо ORA-00955 (об'єкт вже існує) для таблиць/індексів
        if (sql.includes('CREATE TABLE USERS') && Math.random() > 0.5) {
            // 50% шанс, що USERS вже існує
            const error = new Error('ORA-00955: name is already used by an existing object')
            error.oracleErrorNum = 955 // Важливо для логіки existsErrorCode
            throw error
        }
        if (sql.includes('CREATE TABLE ROLES') && Math.random() > 0.7) {
            // 30% шанс, що ROLES вже існує
            const error = new Error('ORA-00955: name is already used by an existing object')
            error.oracleErrorNum = 955
            throw error
        }
        if (sql.includes('CREATE INDEX IDX_USERS_DELETED_AT') && Math.random() > 0.6) {
            // 40% шанс, що індекс вже існує
            const error = new Error('ORA-00955: name is already used by an existing object')
            error.oracleErrorNum = 955
            throw error
        }

        // Імітуємо тимчасові помилки для тестування логіки повторних спроб
        // Робимо так, щоб перші 1-2 спроби могли "впасти" для конкретної таблиці
        if (
            sql.includes('CREATE TABLE USER_ROLES') &&
            (mockOracleDbManager.userRolesErrorCount || 0) < 1
        ) {
            mockOracleDbManager.userRolesErrorCount =
                (mockOracleDbManager.userRolesErrorCount || 0) + 1
            throw new Error('Simulated transient database connection error for USER_ROLES')
        }

        // console.log(`[DB MOCK] Executing SQL for ${dbName}:\n${sql}`);
        return { rowsAffected: 1 } // Імітуємо успішне виконання
    },
    userRolesErrorCount: 0, // Лічильник помилок для імітації retry
}

/**
 * Мок-об'єкт для імітації логера.
 */
const mockLogger = {
    info: (...args) => console.log(`[INFO] ${new Date().toISOString()} ${args.join(' ')}`),
    warn: (...args) => console.warn(`[WARN] ${new Date().toISOString()} ${args.join(' ')}`),
    error: (...args) => console.error(`[ERROR] ${new Date().toISOString()} ${args.join(' ')}`),
}
// --- Кінець мок-реалізацій ---

/**
 * Основна функція для ініціалізації схеми бази даних.
 * @param {string} dbName - Назва з'єднання з базою даних.
 */
export async function initializeDatabase(dbName) {
    mockLogger.info('Starting database schema initialization process...')

    try {
        // 1. Побудувати всі необхідні SQL-операції на основі декларативної схеми
        const operations = buildSchemaOperations(schemaDefinitions)
        mockLogger.info(`Generated ${operations.length} schema operations.`)

        // 2. Виконати операції послідовно
        await runSchemaOperations(dbName, operations, mockLogger, mockOracleDbManager)

        mockLogger.info('Database schema initialization completed successfully.')
    } catch (error) {
        mockLogger.error(`Database schema initialization failed: ${error.message}`, { error })
        // Прокидаємо помилку далі, щоб зовнішній викликаючий код міг її обробити
        throw error
    }
}

// Приклад використання в якості самостійного скрипту:
// Для запуску в Node.js, переконайтеся, що у вашому package.json є "type": "module".
// Тоді просто запустіть: `node dbInitializer.js`

const DB_CONNECTION_NAME = 'MY_ORACLE_DB_DEV' // Замініть на реальне ім'я вашого з'єднання з БД

// Самостійний виклик функції ініціалізації
// ;(async () => {
//     try {
//         await initializeDatabase(DB_CONNECTION_NAME)
//         console.log('\n--- Script finished successfully. ---')
//         process.exit(0) // Завершити процес з кодом успіху
//     } catch (error) {
//         console.error('\n--- Script terminated with errors. ---')
//         process.exit(1) // Завершити процес з кодом помилки
//     }
// })()

const operations = buildSchemaOperations(schemaDefinitions)
console.log(operations)

const refreshTokenMigration = operations.find((m) => m.name === 'REFRESH_TOKENS')
console.log(refreshTokenMigration.sql)
