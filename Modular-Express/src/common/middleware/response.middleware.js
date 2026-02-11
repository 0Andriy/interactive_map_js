/**
 * @typedef {Object} PaginationMeta
 * @property {number} [total] - Загальна кількість записів
 * @property {number} [page] - Поточна сторінка
 * @property {number} [limit] - Кількість елементів на сторінці
 * @property {string|null} [nextCursor] - Курсор для наступної сторінки
 * @property {boolean} [hasNextPage] - Чи є наступна сторінка
 */

/**
 * @typedef {Object} StandardResponse
 * @property {string} status - Статус ('success' або 'error')
 * @property {Object} data - Основні дані запиту
 * @property {Object} [meta] - Мета-дані (пагінація, статистика тощо)
 * @property {string} [message] - Повідомлення для користувача
 * @property {string} [code] - Технічний код помилки
 */

/**
 * @typedef {Object} ValidationError
 * @property {string} field - Назва поля, де сталася помилка
 * @property {string} message - Опис проблеми з цим полем
 */

/**
 * Middleware для стандартизації відповідей API
 */
export const responseEnhancer = (req, res, next) => {
    /**
     * Відправляє успішну відповідь
     *
     * @example
     * // Простий масив (перетвориться на { items: [] })
     * res.success([1, 2, 3]);
     *
     * @example
     * // Об'єкт з пагінацією по сторінках
     * res.success(products, { pagination: { total: 100, page: 1, limit: 10 } });
     *
     * @example
     * // Об'єкт з курсором та додатковими даними
     * res.success({ items: posts, author: "Admin" }, { nextCursor: 'xyz123' });
     *
     * @param {Object|Array} payload - Дані для відправки
     * @param {string} [message='Success'] - Повідомлення про успіх
     * @param {Object} [meta={}] - Додаткова інформація - Мета-дані (пагінація, курсори)
     * @param {number} [statusCode=200] - HTTP статус код
     */
    res.success = (payload, message = 'Success', meta = {}, statusCode = 200) => {
        let data = payload

        // Автоматичне обгортання масиву для майбутньої гнучкості
        // Якщо payload - масив, обгортаємо в об'єкт з ключем items
        if (Array.isArray(payload)) {
            data = { items: payload }
        }

        res.status(statusCode).json({
            ok: true,
            status: 'success',
            message: message,
            data: data || {},
            meta: {
                timestamp: new Date().toISOString(),
                ...meta,
            },
        })
    }

    /**
     * Відправляє відповідь з помилкою
     *
     * @param {string} message - Опис помилки
     * @param {number} [statusCode=500] - HTTP статус код
     * @param {string} [errorCode='INTERNAL_ERROR'] - Унікальний код помилки
     * @param {Array<ValidationError>|Object} [errors=null] - Деталі помилок
     * @param {Object} [meta={}] - Додаткова мета-інформація
     */
    res.error = (
        message,
        statusCode = 500,
        errorCode = 'INTERNAL_ERROR',
        errors = null,
        meta = {},
    ) => {
        res.status(statusCode).json({
            ok: false,
            status: 'error',
            message: message,
            code: errorCode,
            errors: errors,
            meta: {
                timestamp: new Date().toISOString(),
                ...meta,
            },
        })
    }

    next()
}
