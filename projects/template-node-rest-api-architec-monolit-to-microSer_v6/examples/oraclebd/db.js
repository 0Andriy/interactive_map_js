// infrastructure/db.js
import winston from 'winston' // Або ваш улюблений логер
import { OracleDatabaseManager } from './OracleDatabaseManager.js'

// 1. Створюємо логер (можна імпортувати існуючий)
const logger = winston({ level: 'debug' })

// 2. Створюємо єдиний екземпляр менеджера
const dbManager = new OracleDatabaseManager(logger)

// 3. Реєструємо бази даних
// У реальному проекті дані беруться з process.env
await dbManager.register('MAIN', {
    user: process.env.DB_MAIN_USER,
    password: process.env.DB_MAIN_PASSWORD,
    connectString: process.env.DB_MAIN_CONN,
    poolMax: 10,
})

// Можна додати await, якщо ваш Node.js підтримує Top-level await
await dbManager.register('MAIN_POOL', {
    user: 'app',
    password: 'pwd',
    connectString: 'localhost/XE',
})

await dbManager.register(
    'MAIN_DIRECT',
    {
        user: 'admin',
        password: 'pwd',
        connectString: 'localhost/XE',
    },
    true,
)

await dbManager.register('BILLING', {
    user: process.env.DB_BILLING_USER,
    password: process.env.DB_BILLING_PASSWORD,
    connectString: process.env.DB_BILLING_CONN,
    poolMax: 5,
})

// Експортуємо готовий менеджер
export { dbManager }
