import logger from '../utils/logger.js'

function globalErrorHandler(err, req, res, next) {
    // 1. Логування деталей помилки
    logger.error({
        message: err.message,
        stack: err.stack, // Дуже важливо!
        name: err.name,
        // Додаткові властивості, якщо є, наприклад, err.statusCode
        statusCode: err.statusCode || 500,
        status: err.status || 'error',
        // Якщо у вас є власні кастомні властивості для помилок, логуйте їх тут
        // originalError: err // Якщо потрібно побачити весь об'єкт помилки безпосередньо

        // 2. Логування деталей запиту
        request: {
            method: req.method,
            url: req.originalUrl,
            ip: req.ip,
            // headers: req.headers, // Обережно з чутливими даними! Можна фільтрувати.
            params: req.params,
            query: req.query,
            // body: req.body, // Обережно з чутливими даними! Санітизуйте або не логуйте.
        },
        // 3. Логування деталей користувача (якщо доступно)
        user: req.user
            ? {
                  id: req.user.id,
                  email: req.user.email, // Якщо є, знову ж таки, без чутливих даних
              }
            : null,
        // 4. Інші контекстні дані
        // correlationId: req.headers['x-correlation-id'] || generateUniqueId(), // Для відстеження запитів
    })

    // Встановлення статус-коду та повідомлення для відповіді клієнту
    err.statusCode = err.statusCode || 500
    err.status = err.status || 'error'

    // Відправка відповіді клієнту (не відправляйте stack trace клієнту у production!)
    res.status(err.statusCode).json({
        statusCode: err.statusCode,
        status: err.status,
        message:
            err.message || 'Щось пішло не так на сервері. Будь ласка, спробуйте ще раз пізніше.',
        // Не включайте 'error: err' у production, оскільки це може розкрити внутрішні деталі.
        // error: process.env.NODE_ENV === 'development' ? err : undefined, // Тільки для розробки
    })
}

export default globalErrorHandler
