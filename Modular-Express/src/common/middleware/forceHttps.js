/**
 * @file Express middleware to force HTTPS redirection.
 */

/**
 * Middleware to force all incoming HTTP requests to be redirected to HTTPS.
 * This is useful for ensuring secure communication for your web application.
 *
 * @param {boolean} [useHttps=false] - A flag indicating whether HTTPS redirection should be enabled.
 * If `true`, HTTP requests will be redirected to HTTPS.
 * If `false`, the middleware will simply pass the request to the next handler.
 * @returns {function(import('express').Request, import('express').Response, import('express').NextFunction): void} An Express middleware function.
 */
export function forceHttps(useHttps = false) {
    return (req, res, next) => {
        // Check if HTTPS is enabled and if the current request is not secure (i.e., it's HTTP)
        if (!useHttps) {
            return next()
        }

        // Перевіряємо req.secure АБО заголовок x-forwarded-proto (для проксі)
        const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https'

        if (!isSecure) {
            // Construct the HTTPS URL
            const httpsUrl = `https://${req.hostname}${req.originalUrl}`
            // Redirect to the HTTPS URL with a 302 Found status code (temporary redirect).
            // A 301 Moved Permanently (res.redirect(301, httpsUrl)) could also be used,
            // but 302 is often preferred during development or when the redirection might change.
            return res.redirect(httpsUrl)
        }

        // If HTTPS is not enabled, or the request is already secure, proceed to the next middleware
        next()
    }
}

export default forceHttps
