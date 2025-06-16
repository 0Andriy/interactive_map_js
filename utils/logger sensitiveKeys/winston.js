// app.js
import winston from 'winston'
import sanitizeLogData from './utils/logSanitizer.js' // Переконайтеся, що шлях правильний

// Створюємо кастомний формат для Winston
// Цей формат буде застосовуватися до об'єкта `info`, який Winston передає
const sensitiveDataWinstonFilter = winston.format((info) => {
    // Важливо: Winston `info` об'єкт містить `message`, `level` та інші метадані.
    // Ми хочемо санітаризувати будь-які об'єкти або масиви, які можуть бути частиною цього `info` об'єкта.
    // Зокрема, якщо ви передаєте об'єкт як другий аргумент до logger.info(), він зазвичай потрапляє в `info.message`
    // або в кореневі властивості `info`.

    // Створюємо копію info, щоб не змінювати оригінал напряму,
    // хоча Winston зазвичай працює з копіями в форматах.
    const newInfo = { ...info }

    // Проходимо по всіх ключах в об'єкті info (message, level, stack, custom_prop etc.)
    // і санітаризуємо їх, якщо вони є об'єктами.
    for (const key in newInfo) {
        if (Object.prototype.hasOwnProperty.call(newInfo, key)) {
            if (typeof newInfo[key] === 'object' && newInfo[key] !== null) {
                // Застосовуємо нашу універсальну функцію санітаризації
                newInfo[key] = sanitizeLogData(newInfo[key])
            }
        }
    }

    return newInfo // Повертаємо санітаризований об'єкт info
})

// Налаштовуємо Winston логер
const logger = winston.createLogger({
    level: 'info', // Рівень логування
    format: winston.format.combine(
        sensitiveDataWinstonFilter(), // <-- Тут інтегрується наш універсальний фільтр
        winston.format.timestamp(), // Додаємо часову мітку
        winston.format.json(), // Вивід у форматі JSON
    ),
    transports: [
        new winston.transports.Console(), // Логування в консоль
        // new winston.transports.File({ filename: 'combined.log' }) // Логування у файл
    ],
})

// --- Приклади використання ---

// 1. Логування об'єкта напряму
logger.info('User registration attempt', {
    userId: 'user_xyz',
    username: 'test_user',
    email: 'test@example.com',
    password: 'super_secret_password_123', // Буде замасковано
    api_key_internal: 'some_internal_api_key_value', // Буде замасковано
    settings: {
        theme: 'dark',
        notification_code: '12345', // "code" буде замасковано
    },
    user_data_object: {
        old_password: 'previous_pass', // Буде замасковано
        private_token: 'private_jwt_string', // Буде замасковано
    },
})

// 2. Логування об'єкта, що передається в метаданих
logger.error('Database connection failed', {
    error: {
        message: 'Auth error',
        details: 'Invalid credentials',
        connection_string: 'mysql://user:pass@host:port/db?secretKey=XYZ', // "secretKey" буде замасковано
    },
    retries: 3,
})

// 3. Логування простого повідомлення (без об'єктів для санітаризації)
logger.warn('Something unexpected happened.')

// 4. Логування об'єкта з полем, яке відповідає regex, але не є чутливим за змістом (приклад обережності)
logger.info('Analyzing key metrics', {
    keyPerformanceIndicator: 'high', // 'key' тут - частина слова, що НЕ співпадає з regex /key/
    another_key: 'value', // 'key' тут співпадає
})

// 5. Логування помилки з чутливими даними в 'cause'
try {
    throw new Error('Processing failed due to sensitive input', {
        cause: {
            inputData: {
                payment_info: {
                    card_number: '1111222233334444',
                    cvv: '123',
                    card_holder_password: 'card_pass',
                },
                request_token: 'some_request_token',
            },
        },
    })
} catch (error) {
    // В цьому випадку, оскільки `error` сам по собі є об'єктом,
    // і його властивості можуть містити інші об'єкти, наш формат Winston
    // автоматично спробує санітизувати їх.
    logger.error('Caught an exception:', error)
}
