/**
 * Повертає статусну мітку (label) для HTTP статус коду.
 * @param {number} code HTTP статус код
 * @returns {'success'|'fail'|'error'}
 */
function getHttpStatusLabel(code) {
    if (code >= 500) return 'error'
    if (code >= 400) return 'fail'
    return 'success'
}

/**
 * @class CustomError
 * @extends Error
 * @classdesc Гнучкий клас для створення уніфікованих помилок в додатку.
 * Підтримує HTTP статуси, бізнес-коди, вкладені помилки та мета-дані.
 */
class CustomError extends Error {
    /**
     * Створює новий екземпляр CustomError
     * @param {string} message - Людинозрозуміле повідомлення для відображення
     * @param {number} statusCode - HTTP статус код (наприклад 404, 500)
     * @param {string} [code='ERROR'] - Внутрішній бізнес-код помилки (наприклад: USER_NOT_FOUND)
     * @param {object} [meta=null] - Додаткові мета-дані (наприклад: { field: 'email' })
     * @param {Error|null} [originalError=null] - Початкова помилка, якщо обгортка
     * @param {Array} [errors] - Масив додаткових об'єктів помилок (деталізовані повідомлення)
     */
    constructor(
        message,
        statusCode = 500,
        code = 'SERVER_ERROR',
        meta = {},
        originalError = null,
        errors = [],
    ) {
        super(message)

        this.name = this.constructor.name
        this.statusCode = statusCode
        this.code = code
        this.meta = meta
        this.originalError = originalError
        this.errors = errors
        this.status = getHttpStatusLabel(statusCode)

        Error.captureStackTrace(this, this.constructor)
    }

    /**
     * Повертає JSON-об’єкт помилки для відповіді API
     * @returns {object}
     */
    toResponseJSON() {
        const res = {
            message: this.message,
            code: this.code,
            statusCode: this.statusCode,
            status: this.status,
        }

        if (this.meta && Object.keys(this.meta).length > 0) res.meta = this.meta
        if (this.errors && this.errors.length > 0) res.errors = this.errors

        return res
    }

    /**
     * Повертає строкове представлення помилки
     * @returns {string}
     */
    toString() {
        return `${this.name} [${this.statusCode} ${this.code}]: ${this.message}`
    }

    /**
     * Створює CustomError з іншої помилки
     * @param {Error} error
     * @param {number} [statusCode=500]
     * @param {string} [code='INTERNAL_ERROR']
     * @param {object|null} [meta=null]
     * @returns {CustomError}
     */
    static from(error, statusCode = 500, code = 'INTERNAL_ERROR', meta = {}, errors = []) {
        if (error instanceof CustomError) return error

        return new CustomError(error.message, statusCode, code, meta, error, errors)
    }

    // ============ Статичні фабричні методи для типових HTTP помилок ============

    /**
     * Помилка некоректного запиту (400)
     * @param {string} message
     * @param {object} [meta]
     */
    static BadRequest(message = 'Bad Request', meta = {}, errors = []) {
        return new CustomError(message, 400, 'BAD_REQUEST', meta, null, errors)
    }

    /**
     * Помилка аутентифікації (401)
     * @param {string} message
     * @param {object} [meta]
     */
    static Unauthorized(message = 'Unauthorized', meta = {}, errors = []) {
        return new CustomError(message, 401, 'UNAUTHORIZED', meta, null, errors)
    }

    /**
     * Помилка авторизації (403)
     * @param {string} message
     * @param {object} [meta]
     */
    static Forbidden(message = 'Forbidden', meta = {}, errors = []) {
        return new CustomError(message, 403, 'FORBIDDEN', meta, null, errors)
    }

    /**
     * Ресурс не знайдено (404)
     * @param {string} message
     * @param {object} [meta]
     */
    static NotFound(message = 'Not Found', meta = {}, errors = []) {
        return new CustomError(message, 404, 'NOT_FOUND', meta, null, errors)
    }

    /**
     * Конфлікт, наприклад: дублікат email або username (409)
     * @param {string} message
     * @param {object} [meta]
     */
    static Conflict(message = 'Conflict', meta = {}, errors = []) {
        return new CustomError(message, 409, 'CONFLICT', meta, null, errors)
    }

    /**
     * Помилка валідації (422)
     * Наприклад: валідація email, пароля тощо
     * @param {string} message
     * @param {object} [meta]
     */
    static Validation(message = 'Validation Error', meta = {}, errors = []) {
        return new CustomError(message, 422, 'VALIDATION_ERROR', meta, null, errors)
    }

    /**
     * Занадто багато запитів (429)
     * @param {string} message
     * @param {object} [meta]
     */
    static TooManyRequests(message = 'Too Many Requests', meta = {}, errors = []) {
        return new CustomError(message, 429, 'RATE_LIMIT_EXCEEDED', meta, null, errors)
    }

    /**
     * Необроблена помилка сервера (500)
     * @param {string} message
     * @param {object} [meta]
     * @param {Error|null} [originalError]
     */
    static Internal(
        message = 'Internal Server Error',
        meta = {},
        originalError = null,
        errors = [],
    ) {
        return new CustomError(message, 500, 'INTERNAL_ERROR', meta, originalError, errors)
    }
}

export default CustomError
