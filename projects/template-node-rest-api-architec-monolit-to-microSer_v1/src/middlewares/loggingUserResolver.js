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
const decodeJwtWithoutVerification = (token) => {
    if (!token || typeof token !== 'string') return null

    const parts = token.split('.')
    if (parts.length !== 3) {
        // console.warn('Некоректний формат JWT: очікується 3 частини.');
        return null
    }

    const payloadBase64Url = parts[1] // The middle part is the Payload

    return decodeBase64Url(payloadBase64Url)
}

/**
 * Middleware that attempts to extract user data (ID, roles) from an `accessToken`
 * or `refreshToken` found in various request sources (headers, cookies, body)
 * for logging purposes. It **does not verify the token's signature**, meaning
 * the extracted data should only be used for logging and not for authorization.
 *
 * The extracted user ID, roles, and the source of the token are attached to `req.logUserContext`.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @param {import('express').NextFunction} next - The next middleware function in the stack.
 * @returns {void}
 */
export const loggingUserResolver = (req, res, next) => {
    let userIdentifier = 'anonymous' // Default identifier
    let userRoles = [] // User roles
    let source = 'none' // Where the data came from

    /**
     * Helper function to find and decode a token from specified sources in order of preference.
     * @param {string} tokenName - The name of the token (e.g., 'accessToken', 'refreshToken').
     * @param {Array<'header' | 'cookie' | 'body'>} preferredSourceOrder - An array specifying the order of sources to check (e.g., ['header', 'cookie']).
     * @returns {object|null} The decoded token payload, or null if not found or decoding fails.
     */
    const findAndDecodeToken = (tokenName, preferredSourceOrder) => {
        let token = null

        for (const src of preferredSourceOrder) {
            if (src === 'header') {
                // 1. Try to get token from Authorization header (access token)
                const authHeader = req.headers['authorization']
                if (authHeader && authHeader.startsWith('Bearer ')) {
                    token = authHeader.split(' ')[1]
                    if (token) {
                        source = `header (${tokenName})`
                        break
                    }
                }
                // Also check custom header, if any (e.g., for refresh token)
                if (req.headers[`x-${tokenName}`]) {
                    token = req.headers[`x-${tokenName}`]
                    if (token) {
                        source = `header (x-${tokenName})`
                        break
                    }
                }
            } else if (src === 'cookie' && req.cookies) {
                if (req.cookies[tokenName]) {
                    token = req.cookies[tokenName]
                    source = `cookie (${tokenName})`
                    break
                }
            } else if (src === 'body' && req.body) {
                if (req.body[tokenName]) {
                    token = req.body[tokenName]
                    source = `body (${tokenName})`
                    break
                }
            }
        }

        if (token) {
            return decodeJwtWithoutVerification(token)
        }
        return null
    }

    // 1. Try to get data from Access Token
    // Priority order for Access Token: Header (Authorization Bearer), Cookie, Body
    const decodedAccessToken = findAndDecodeToken('accessToken', ['header', 'cookie', 'body'])

    if (decodedAccessToken && decodedAccessToken.id) {
        userIdentifier = decodedAccessToken.id
        userRoles = Array.isArray(decodedAccessToken.roles) ? decodedAccessToken.roles : []
        // `source` is already set inside `findAndDecodeToken`
    }

    // 2. If Access Token didn't provide information, try Refresh Token
    // Priority order for Refresh Token: Header (x-refresh-token), Cookie, Body
    if (userIdentifier === 'anonymous') {
        const decodedRefreshToken = findAndDecodeToken(
            'refreshToken',
            ['header', 'cookie', 'body'], // Assume refresh token can also be in x-refresh-token header
        )

        if (decodedRefreshToken && decodedRefreshToken.userId) {
            userIdentifier = decodedRefreshToken.userId
            userRoles = Array.isArray(decodedRefreshToken.roles) ? decodedRefreshToken.roles : []
            // `source` is already set inside `findAndDecodeToken`
        }
    }

    // Attach the resolved user context to the request object for later logging
    req.logUserContext = {
        userId: userIdentifier,
        userRoles: userRoles,
        tokenSource: source,
    }

    next()
}
