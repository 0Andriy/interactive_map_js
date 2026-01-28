/**
 * @file Утиліта для очищення та обмеження розміру логів.
 */

const SENSITIVE_FIELDS = ['password', 'secret', 'authorization', 'cookie', 'card', 'key']
const MAX_STRING_LENGTH = 500 // Обрізати довгі рядки (наприклад, Base64)
const MAX_BODY_KEYS = 50 // Обмежити кількість полів у об'єкті

/**
 * Рекурсивне очищення та обрізання даних
 */
export const sanitize = (data, depth = 0) => {
    if (depth > 5) return '[DEPTH_LIMIT_REACHED]' // Захист від циклічних посилань
    if (!data || typeof data !== 'object') {
        if (typeof data === 'string' && data.length > MAX_STRING_LENGTH) {
            return (
                data.substring(0, MAX_STRING_LENGTH) + `... [TRUNCATED, total ${data.length} chars]`
            )
        }
        return data
    }

    const isArray = Array.isArray(data)
    const cleanData = isArray ? [] : {}
    const keys = Object.keys(data)

    // Обмеження кількості полів
    const keysToProcess = keys.slice(0, MAX_BODY_KEYS)

    for (const key of keysToProcess) {
        const value = data[key]

        // 1. Маскування чутливих полів
        if (
            typeof key === 'string' &&
            SENSITIVE_FIELDS.some((field) => key.toLowerCase().includes(field))
        ) {
            cleanData[key] = '[SENSITIVE]'
        }
        // 2. Рекурсія для об'єктів
        else if (typeof value === 'object' && value !== null) {
            cleanData[key] = sanitize(value, depth + 1)
        }
        // 3. Обрізання довгих рядків
        else if (typeof value === 'string' && value.length > MAX_STRING_LENGTH) {
            cleanData[key] = value.substring(0, MAX_STRING_LENGTH) + `... [TRUNCATED]`
        } else {
            cleanData[key] = value
        }
    }

    if (keys.length > MAX_BODY_KEYS) {
        cleanData['__logs_info'] = `[TRUNCATED: only ${MAX_BODY_KEYS} of ${keys.length} keys shown]`
    }

    return cleanData
}
