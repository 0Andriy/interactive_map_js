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
     * res.success(products, {
     *   meta: { total: 100 },
     *   statistics: { active: 5 }
     * });
     *
     * @param {Object|Array} payload - Дані для відправки
     * @param {Object} [options] - Додаткові параметри
     * @param {number} [options.statusCode=200] - HTTP статус
     * @param {string} [options.message='Success'] - Повідомлення
     * @param {PaginationMeta} [options.meta] - Мета-дані пагінації
     * @param {Object} [options.extra] - Будь-які інші поля (розгорнуться в корінь)
     */
    res.success = (
        payload,
        { statusCode = 200, message = 'Success', meta = {}, ...extra } = {},
    ) => {
        let data = payload

        // Автоматичне обгортання масиву для майбутньої гнучкості
        if (Array.isArray(payload)) {
            data = { items: payload }
        }

        res.status(statusCode).json({
            ok: true,
            status: 'success',
            message,
            data: data || {},
            meta: {
                timestamp: new Date().toISOString(),
                ...meta,
            },
            ...extra, // Розгортаємо складні об'єкти (stats, system info тощо)
        })
    }

    /**
     * Відправляє відповідь з помилкою
     *
     * @param {string} message - Опис помилки
     * @param {Object} [options] - Додаткові параметри
     * @param {number} [options.statusCode=500] - HTTP статус
     * @param {string} [options.errorCode='INTERNAL_ERROR'] - Технічний код
     * @param {Array<ValidationError>|Object} [options.errors=null] - Деталі помилок
     */
    res.error = (
        message,
        { statusCode = 500, errorCode = 'INTERNAL_ERROR', errors = null, ...extra } = {},
    ) => {
        res.status(statusCode).json({
            ok: false,
            status: 'error',
            message,
            code: errorCode,
            errors,
            meta: {
                timestamp: new Date().toISOString(),
            },
            ...extra,
        })
    }

    next()
}
