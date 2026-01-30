/**
 * @file Express middleware for resolving user context for logging purposes without full JWT verification.
 */

/**
 * Helper function to decode a Base64Url string into a JSON object.
 * This function handles the specific encoding differences between Base64Url and standard Base64.
 *
 * @param {string} base64UrlString - The Base64Url encoded string.
 * @returns {object|null} The decoded JSON object, or `null` if decoding fails or the input is invalid.
 */
const decodeBase64Url = (base64UrlString) => {
    if (!base64UrlString) return null
    try {
        // Base64Url differs from standard Base64 by replacing '-' with '+', '_' with '/',
        // and omitting padding '=' at the end.
        let base64 = base64UrlString.replace(/-/g, '+').replace(/_/g, '/')

        // Add padding '=' if necessary to ensure length is a multiple of 4
        while (base64.length % 4) {
            base64 += '='
        }

        // Decode Base64 and convert to JSON
        // `atob` decodes a Base64-encoded string.
        // The `map` and `join` part is for handling potential UTF-8 characters correctly after `atob`.
        const decodedPayload = decodeURIComponent(
            atob(base64)
                .split('')
                .map(function (c) {
                    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
                })
                .join(''),
        )

        return JSON.parse(decodedPayload)
    } catch (error) {
        // console.error('Помилка декодування Base64Url:', error.message);
        return null
    }
}

/**
 * Performs a basic decoding of a JWT without verifying its signature.
 * This function is used to extract the payload (claims) from a JWT for logging or
 * context purposes when full cryptographic verification is not required or desired.
 *
 * @param {string} token - The JWT string.
 * @returns {object|null} The decoded payload of the token, or `null` if the token is invalid or malformed.
 */
const decodeJwtPayload = (token) => {
    if (!token || typeof token !== 'string') return null

    try {
        const parts = token.split('.')
        if (parts.length !== 3) return null

        // Node.js Buffer вміє працювати з base64url напряму
        const payload = Buffer.from(parts[1], 'base64url').toString('utf8')
        return JSON.parse(payload)
    } catch {
        return null
    }
}

/**
 * Middleware that attempts to extract user data (ID, roles) from an `accessToken`
 * or `refreshToken` found in various request sources (headers, cookies, body)
 * for logging purposes. It **does not verify the token's signature**, meaning
 * the extracted data should only be used for logging and not for authorization.
 *
 * The extracted user ID, roles, and the source of the token are attached to `req.user`.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @param {import('express').NextFunction} next - The next middleware function in the stack.
 * @returns {void}
 */
export async function userResolver(req, res, next) {
    // Початковий стан (якщо токен не знайдено або він битий)
    let userContext = {
        id: 'anonymous',
        login: null,
        roles: [],
        tokenSource: 'none',
    }

    // Описуємо стратегію пошуку токенів
    const sources = [
        { name: 'accessToken', types: ['header', 'cookie', 'body'] },
        { name: 'refreshToken', types: ['header', 'cookie', 'body'] },
    ]

    for (const s of sources) {
        let token = null
        let currentSource = 'none'

        for (const type of s.types) {
            if (type === 'header') {
                const auth = req.headers['authorization']
                if (auth?.startsWith('Bearer ')) {
                    token = auth.split(' ')[1]
                    currentSource = `header (${s.name})`
                } else if (req.headers[`x-${s.name}`]) {
                    token = req.headers[`x-${s.name}`]
                    currentSource = `header (x-${s.name})`
                }
            } else if (type === 'cookie' && req.cookies?.[s.name]) {
                token = req.cookies[s.name]
                currentSource = `cookie (${s.name})`
            } else if (type === 'body' && req.body?.[s.name]) {
                token = req.body[s.name]
                currentSource = `body (${s.name})`
            }

            if (token) {
                const decoded = decodeJwtPayload(token)
                // Перевіряємо наявність ідентифікатора (userId або sub)
                if (decoded && (decoded.userId || decoded.sub)) {
                    userContext = {
                        id: decoded.userId || decoded.sub,
                        login: decoded.username || decoded.login || decoded.email || null,
                        roles: Array.isArray(decoded.roles) ? decoded.roles : [],
                        tokenSource: currentSource,
                    }
                    break // Знайшли валідний токен у цьому джерелі
                }
                token = null // Скидаємо, якщо токен був, але він порожній/битий
            }
        }

        // Якщо знайшли дані в accessToken, не шукаємо в refreshToken
        if (userContext.id !== 'anonymous') break
    }

    // ОНОВЛЕННЯ: Синхронізація з AsyncLocalStorage через об'єкт посилання
    // Тепер логер автоматично побачить користувача через req.context.user
    if (req.context) {
        req.context.user = userContext
    }

    // Attach the resolved user context to the request object for later logging
    req.user = userContext

    next()
}
