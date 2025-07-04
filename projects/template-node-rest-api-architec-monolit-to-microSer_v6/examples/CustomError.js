export class CustomError extends Error {
    /**
     * @param {number} statusCode - HTTP статус код
     * @param {string} message - Головне повідомлення про помилку
     * @param {Array|object|null} errors - Додаткові помилки або поля, які не пройшли валідацію
     * @param {string|null} code - Унікальний внутрішній код помилки (не обов’язково)
     */
    constructor(statusCode, message, errors = null, code = null) {
        super(message)

        this.name = this.constructor.name
        this.statusCode = statusCode
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error'
        this.errors = Array.isArray(errors) || typeof errors === 'object' ? errors : null
        this.code = code ?? null // Унікальний внутрішній код, якщо треба (наприклад, `USER_NOT_FOUND`)

        this.isOperational = true // Маркує помилку як контрольовану

        Error.captureStackTrace(this, this.constructor)
    }

    /** 400 Bad Request */
    static BadRequest(message = 'Bad request', errors = null, code = null) {
        return new CustomError(400, message, errors, code)
    }

    /** 401 Unauthorized */
    static Unauthorized(message = 'Unauthorized', errors = null, code = null) {
        return new CustomError(401, message, errors, code)
    }

    /** 403 Forbidden */
    static Forbidden(message = 'Forbidden', errors = null, code = null) {
        return new CustomError(403, message, errors, code)
    }

    /** 404 Not Found */
    static NotFound(message = 'Not found', errors = null, code = null) {
        return new CustomError(404, message, errors, code)
    }

    /** 409 Conflict (наприклад, при реєстрації користувача з уже існуючим email) */
    static Conflict(message = 'Conflict', errors = null, code = null) {
        return new CustomError(409, message, errors, code)
    }

    /** 422 Unprocessable Entity (для валідацій, DTO, payload проблем) */
    static Unprocessable(message = 'Unprocessable Entity', errors = null, code = null) {
        return new CustomError(422, message, errors, code)
    }

    /** 500 Internal Server Error */
    static Internal(message = 'Internal server error', errors = null, code = null) {
        return new CustomError(500, message, errors, code)
    }
}
