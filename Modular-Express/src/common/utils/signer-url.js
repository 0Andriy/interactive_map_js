import crypto from 'node:crypto'

/**
 * @typedef {Object} SigningOptions
 * @property {number} [expiresIn=43200] - Термін дії у секундах (дефолт 12 годин).
 * @property {string} [ip] - IP-адреса клієнта для жорсткої прив'язки.
 * @property {Object.<string, string|number>} [extraParams={}] - Додаткові параметри (наприклад, userId, filter), які будуть захищені підписом.
 */

const SECRET = process.env.SIGNING_SECRET

/**
 * Створює підписаний URL, що включає мітку часу та криптографічний хеш.
 * Функція автоматично обробляє існуючі query-параметри у шляху.
 *
 * @param {string} inputPath - Базовий шлях (наприклад, '/api/download' або '/files?type=pdf').
 * @param {SigningOptions} [options={}] - Налаштування безпеки.
 * @returns {string} URL із параметрами expires, uip (опціонально) та sig.
 *
 * @example
 * // Простий шлях
 * const url = createSignedUrl('/download/report.pdf', { expiresIn: 3600 });
 * // Поверне: /download/report.pdf?expires=1710000000&sig=a1b2c3...
 *
 * @example
 * // Шлях, який вже має параметри
 * const url = createSignedUrl('/api/items?category=books', {
 *   extraParams: { user_id: 123 }
 * });
 * // Поверне: /api/items?category=books&expires=1710000000&user_id=123&sig=d4e5f6...
 *
 *
 * @example
 * const url = createSignedUrl('/api/v1/data.csv', {
 *   expiresIn: 3600,
 *   ip: '192.168.1.1',
 *   extraParams: { downloadType: 'batch' }
 * });
 */
export const createSignedUrl = (
    inputPath,
    { expiresIn = 60 * 60 * 12, ip, extraParams = {} } = {},
) => {
    // 1. Розбираємо вхідний шлях на частині (на випадок якщо там вже є '?')
    const [baseUrl, existingQuery] = inputPath.split('?')
    const params = new URLSearchParams(existingQuery)

    // 2. Об'єднуємо існуючі параметри з новими та додаємо час життя
    for (const [key, value] of Object.entries(extraParams)) {
        params.set(key, String(value))
    }

    if (ip) params.set('uip', ip)

    const expires = Math.floor(Date.now() / 1000) + expiresIn
    params.set('expires', String(expires))

    // 3. Сортуємо параметри (це критично для стабільності підпису!)
    params.sort()

    // 4. Створюємо рядок для підпису (тільки pathname + відсортовані query)
    const dataToSign = `${baseUrl}?${params.toString()}`
    const signature = crypto.createHmac('sha256', SECRET).update(dataToSign).digest('hex')

    // 5. Повертаємо повний URL з підписом
    params.set('sig', signature)
    return `${baseUrl}?${params.toString()}`
}

/**
 * Верифікує підпис на основі шляху та об'єкта параметрів.
 * Використовує Constant-time порівняння для захисту від атак за часом.
 *
 * @param {string} path - Шлях запиту (без query-параметрів).
 * @param {Object} query - Об'єкт query-параметрів із запиту (має містити `sig` та `expires`).
 * @param {string} currentClientIp - Поточний IP клієнта (req.ip).
 * @returns {boolean} True, якщо підпис валідний та термін дії не вичерпано.
 *
 * @example
 * const isValid = verifySignatureRaw('/api/download', {
 *   expires: '1710000000',
 *   sig: 'a1b2c3...',
 *   user_id: '123'
 * });
 */
export const verifySignature = (req, currentClientIp) => {
    const { sig, ...paramsWithoutSig } = req.query
    if (!sig || !paramsWithoutSig.expires) return false

    // 1. Перевірка часу (терміну дії)
    if (Math.floor(Date.now() / 1000) > parseInt(String(paramsWithoutSig.expires), 10)) {
        return false
    }

    // 2. Перевірка прив'язки до IP (якщо вона була вшита)
    if (paramsWithoutSig.uip && paramsWithoutSig.uip !== currentClientIp) {
        return false
    }

    // 3. Відтворюємо параметри точно так само, як при створенні (Реконструкція підпису)
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(paramsWithoutSig)) {
        params.set(key, String(value))
    }
    params.sort()

    // req.path в Express — це шлях БЕЗ query (наприклад, /cdn/download/1)
    const dataToSign = `${req.path}?${params.toString()}`

    const expectedSignature = crypto.createHmac('sha256', SECRET).update(dataToSign).digest('hex')

    // 4. Безпечне порівняння буферів (захист від timing attacks)
    try {
        // 4. Безпечне порівняння буферів однакової довжини
        const sigBuffer = Buffer.from(sig)
        const expectedBuffer = Buffer.from(expectedSignature)

        if (sigBuffer.length !== expectedBuffer.length) return false

        return crypto.timingSafeEqual(sigBuffer, expectedBuffer)
    } catch (err) {
        return false
    }
}
