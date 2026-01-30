/**
 * Повертає статусну мітку (label) для HTTP статус коду згідно з JSend.
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
 * @classdesc Уніфікований клас помилок з підтримкою фабричних методів та авто-конвертації.
 */
export class CustomError extends Error {
    /**
     * @param {string} message - Повідомлення для користувача
     * @param {number} statusCode - HTTP статус код
     * @param {string} [code='SERVER_ERROR'] - Внутрішній бізнес-код
     * @param {object} [meta={}] - Додаткові дані для контексту
     * @param {Error|null} [originalError=null] - Оригінальна помилка
     * @param {Array} [errors=[]] - Масив деталізованих помилок (наприклад, валідація)
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

        // Виключаємо конструктор зі стеку для чистоти логів
        Error.captureStackTrace(this, this.constructor)
    }

    /**
     * Формує JSON для відповіді API
     */
    toResponseJSON() {
        const res = {
            status: this.status,
            message: this.message,
            code: this.code,
            statusCode: this.statusCode,
        }

        if (this.meta && Object.keys(this.meta).length > 0) res.meta = this.meta
        if (this.errors && this.errors.length > 0) res.errors = this.errors

        return res
    }

    /**
     * Створює CustomError з будь-якої іншої помилки (авто-мапінг)
     * @param {Error|any} error
     */
    static from(error) {
        if (error instanceof CustomError) return error

        // 1. Помилки Oracle Database (ORA-XXXXX)
        if (error.errorNum || (error.message && error.message.includes('ORA-'))) {
            return CustomError.Internal(
                'Database connection or execution error',
                { oraCode: error.errorNum || 'ORA_UNKNOWN' },
                error,
            )
        }

        // 2. Помилки JWT
        if (error.name === 'JsonWebTokenError') {
            return CustomError.Unauthorized('Invalid signature. Access denied.')
        }
        if (error.name === 'TokenExpiredError') {
            return CustomError.Unauthorized('Token has expired. Please login again.')
        }

        // 3. Помилки валідації (express-validator та інші)
        if (Array.isArray(error.errors) || (error.array && typeof error.array === 'function')) {
            const details = error.array ? error.array() : error.errors
            return CustomError.Validation('Validation failed', {}, details)
        }

        // 4. Якщо помилка вже має статус (від сторонніх бібліотек)
        const status = error.statusCode || error.status || 500
        const message = error.message || 'An unexpected error occurred'

        return new CustomError(message, status, 'INTERNAL_ERROR', {}, error)
    }

    // ============ Фабричні методи ============

    static BadRequest(message = 'Bad Request', meta = {}, errors = []) {
        return new CustomError(message, 400, 'BAD_REQUEST', meta, null, errors)
    }

    static Unauthorized(message = 'Unauthorized', meta = {}, errors = []) {
        return new CustomError(message, 401, 'UNAUTHORIZED', meta, null, errors)
    }

    static Forbidden(message = 'Forbidden', meta = {}, errors = []) {
        return new CustomError(message, 403, 'FORBIDDEN', meta, null, errors)
    }

    static NotFound(message = 'Not Found', meta = {}, errors = []) {
        return new CustomError(message, 404, 'NOT_FOUND', meta, null, errors)
    }

    static Conflict(message = 'Conflict', meta = {}, errors = []) {
        return new CustomError(message, 409, 'CONFLICT', meta, null, errors)
    }

    static Validation(message = 'Validation Error', meta = {}, errors = []) {
        return new CustomError(message, 422, 'VALIDATION_ERROR', meta, null, errors)
    }

    static TooManyRequests(message = 'Too Many Requests', meta = {}, errors = []) {
        return new CustomError(message, 429, 'RATE_LIMIT_EXCEEDED', meta, null, errors)
    }

    static Internal(message = 'Internal Server Error', meta = {}, originalError = null) {
        return new CustomError(message, 500, 'INTERNAL_ERROR', meta, originalError)
    }
}

export default CustomError
