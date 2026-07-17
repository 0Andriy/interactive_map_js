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
     * @param {string} message - Повідомлення для користувача (публічне)
     * @param {number} statusCode - HTTP статус код (400, 401, 403, 500)
     * @param {string} [code='SERVER_ERROR'] - Внутрішній бізнес-код помилки
     * @param {object} [meta={}] - Додаткові дані для контексту
     * @param {Error|null} [originalError=null] - Оригінальна помилка (першопричина)
     * @param {Array} [errors=[]] - Масив деталізованих помилок (наприклад, валідація стовпчиків)
     */
    constructor(
        message,
        statusCode = 500,
        code = 'SERVER_ERROR',
        meta = {},
        originalError = null,
        errors = [],
    ) {
        // Передаємо повідомлення у базовий клас і реєструємо стандартну властивість cause
        super(message, originalError ? { cause: originalError } : undefined)

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
     * Формує чистий JSON для відповіді клієнту (JSend API формат)
     */
    toResponseJSON() {
        const res = {
            status: this.status,
            code: this.code,
            message: this.message,
            statusCode: this.statusCode,
        }

        if (this.meta && Object.keys(this.meta).length > 0) res.meta = this.meta
        if (this.errors && this.errors.length > 0) res.errors = this.errors

        return res
    }

    /**
     * СТАТИЧНА ФАБРИКА: Перетворює будь-яку помилку (HTTP, Системну, JWT) на CustomError
     * @param {Error|Object} error - Перехоплена помилка з блоку catch
     * @param {string} fallbackSysCode - Системний код, який присвоїться, якщо помилка не є CustomError
     * @returns {CustomError}
     */
    static from(error, fallbackSysCode = 'INTERNAL_SERVER_ERROR') {
        // 1. Якщо помилка вже є екземпляром CustomError — повертаємо її як є (просто прокидаємо по ланцюжку)
        if (error instanceof CustomError) {
            return error
        }

        // 2. Якщо це помилка HTTP-клієнта (наприклад, Axios, чи вашого внутрішнього httpClient)
        // Зазвичай у них є об'єкт response зі статусом та даними помилки від зовнішнього сервера
        if (error.response) {
            const externalStatus = error.response.status || 502 // 502 Bad Gateway, бо підвів сторонній сервер
            const externalMessage =
                error.response.data?.message || error.response.statusText || error.message

            return new CustomError(
                `Помилка зовнішнього сервісу: ${externalMessage}`,
                externalStatus,
                {
                    sysCode: fallbackSysCode,
                    externalError: true,
                    originalMessage: error.message,
                },
            )
        }

        // 3. Якщо це помилка таймауту мережі (сервер не відповів вчасно)
        if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
            return new CustomError(
                'Перевищено час очікування відповіді від зовнішнього сервера.',
                504, // 504 Gateway Timeout
                { sysCode: fallbackSysCode, code: 'TIMEOUT' },
            )
        }

        // 1. Помилки Oracle Database (ORA-XXXXX)
        if (error.errorNum || (error.message && error.message.includes('ORA-'))) {
            return CustomError.Internal(
                'Помилка виконання операції в базі даних',
                {
                    oraCode: error.errorNum || 'ORA_UNKNOWN',
                    details: error.message,
                },
                error,
            )
        }

        // 2. Помилки бібліотеки JOSE JWT (замість jwt.sign/verify)
        if (error.code && error.code.startsWith('ERR_JWT_')) {
            if (error.code === 'ERR_JWT_EXPIRED') {
                return CustomError.Unauthorized(
                    'Термін дії токена закінчився. Будь ласка, увійдіть знову.',
                    {
                        sysCode: 'ACCESS_TOKEN_EXPIRED',
                    },
                )
            }
            return CustomError.Unauthorized('Криптографічний підпис токена невалідний.', {
                sysCode: 'INVALID_ACCESS_TOKEN',
            })
        }

        // 3. Помилки валідації (express-validator та інші)
        if (Array.isArray(error.errors) || (error.array && typeof error.array === 'function')) {
            const details = error.array ? error.array() : error.errors
            return CustomError.Validation('Validation failed', {}, details)
        }

        // 4. Якщо помилка вже має статус (від сторонніх бібліотек)
        // Базові помилки рантайму
        const status = error.statusCode || error.status || 500
        const message = error.message || 'Сталася непередбачувана помилка сервера'

        return new CustomError(message, status, 'INTERNAL_SERVER_ERROR', {}, error)
    }

    // ============ Фабричні методи для швидкого викидання помилок ============

    static BadRequest(message = 'Невірний запит', meta = {}, errors = []) {
        return new CustomError(message, 400, 'BAD_REQUEST', meta, null, errors)
    }

    static Unauthorized(message = 'Неавторизовано', meta = {}, errors = []) {
        return new CustomError(message, 401, 'UNAUTHORIZED', meta, null, errors)
    }

    static Forbidden(message = 'Доступ заборонено', meta = {}, errors = []) {
        return new CustomError(message, 403, 'FORBIDDEN', meta, null, errors)
    }

    static NotFound(message = 'Ресурс не знайдено', meta = {}, errors = []) {
        return new CustomError(message, 404, 'NOT_FOUND', meta, null, errors)
    }

    static Conflict(message = 'Конфлікт даних', meta = {}, errors = []) {
        return new CustomError(message, 409, 'CONFLICT', meta, null, errors)
    }

    static Validation(message = 'Помилка валідації вхідних даних', meta = {}, errors = []) {
        return new CustomError(message, 422, 'VALIDATION_ERROR', meta, null, errors)
    }

    static TooManyRequests(
        message = 'Забагато запитів. Спробуйте пізніше',
        meta = {},
        errors = [],
    ) {
        return new CustomError(message, 429, 'RATE_LIMIT_EXCEEDED', meta, null, errors)
    }

    static Internal(message = 'Внутрішня помилка сервера', meta = {}, originalError = null) {
        return new CustomError(message, 500, 'INTERNAL_SERVER_ERROR', meta, originalError)
    }
}

export default CustomError
