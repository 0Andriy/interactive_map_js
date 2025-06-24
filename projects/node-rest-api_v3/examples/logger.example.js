// src/app.js
import logger, { asyncLocalStorage, getLoggerForService } from '../src/utils/logger.js'

// Тестування логера - example
function testLogger(logger) {
    console.log('--- Testing logger with different levels and formats ---')

    // 1. Інформаційне повідомлення
    logger.info('User login successful', {
        userId: 123,
        service: 'auth-service',
        action: 'login',
        password: 1123123
    })

    // 2. Попередження
    logger.warn('User attempted restricted action', {
        userId: 123,
        service: 'auth-service',
        action: 'accessRestrictedArea',
        timestamp: new Date().toISOString(),
    })

    // 3. Помилка з метаданими
    logger.error('Failed to update user profile', {
        userId: 123,
        service: 'profile-service',
        errorDetails: 'Database connection lost',
    })

    // 4. Помилка зі стеком
    const errorWithStack = new Error('Database connection timeout')
    logger.error('Critical error occurred', errorWithStack)

    // 5. Дебаг (якщо рівень логера дозволяє)
    logger.debug('Debugging user flow', {
        userId: 123,
        service: 'debug-service',
        details: { step: 'fetchUserData', status: 'in progress' },
    })

    // 6. Створення дочірнього логера для іншого сервісу
    const userLogger = logger.child({ service: 'user-service' })
    userLogger.info('User created', { userId: 123, email: 'test@gmail.com' })

    // // 7. Логування з іншим сервісом
    // const userLogger1 = getLoggerForService('user-service')
    // userLogger1.info('User created', { userId: 1, email: 'example@gmail.com' })
    // userLogger1.warn('Password reset requested', { userId: 1 })

    // 8. Початок профілювання (відбувається по ID профілювання (message) - 'database-query')
    logger.profile('database-query')

    // Симуляція тривалої операції
    setTimeout(() => {
        // Кінець профілювання
        logger.profile('database-query', { query: 'SELECT * FROM users' })
    }, 1200)

    // 9. Інформація про HTTP-запит (наприклад, для Express)
    logger.info('HTTP request received', {
        method: 'POST',
        url: '/api/v1/users',
        headers: { 'user-agent': 'Mozilla/5.0' },
    })

    // 10. Логування результату обробки запиту
    logger.info('User data processed successfully', {
        userId: 123,
        endpoint: '/api/v1/users',
        responseTimeMs: 150,
    })

    // 11. Використання try-catch для логування помилок
    try {
        throw new Error('Simulated critical error')
    } catch (err) {
        logger.error('Exception caught in try-catch block', err)
    }

    try {
        throw new Error('Simulated critical error12')
    } catch (err) {
        logger.error('Exception caught in try-catch block', err, 1231231, {
            userId: 123,
            service: 'order-service',
            orderId: 456,
        })
    }

    // 12. Логування з профілюванням для окремої операції
    const userProfileLogger = logger.child({ service: 'profile-service' })
    userProfileLogger.profile('fetch-user-profile')
    setTimeout(() => {
        userProfileLogger.profile('fetch-user-profile', {
            userId: 123,
            query: 'SELECT * FROM profiles WHERE id = 123',
        })
    }, 800)

    // 13. Створення дочірнього логера з requestId та correlationId
    const childLogger = logger.child({ requestId: '123', correlationId: '456' })
    req.logger = childLogger
    req.logger.info('User login successful', {
        userId: 123,
        service: 'auth-service',
        action: 'login',
    })

    console.log('--- Test completed ---')
}

// Тестуємо логер
testLogger(logger)
