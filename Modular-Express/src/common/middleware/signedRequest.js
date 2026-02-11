import { verifySignatureRaw } from '../utils/signer.js'

/**
 * Middleware для Express, що блокує запити з невалідним або простроченим цифровим підписом.
 * Використовується для ендпоінтів, що знаходяться поза сесією AccessToken.
 *
 * @param {import('express').Request} req - Об'єкт запиту Express.
 * @param {import('express').Response} res - Об'єкт відповіді Express.
 * @param {import('express').NextFunction} next - Функція передачі керування.
 *
 * @example
 * // 1. У файлі роутів:
 * import { requireValidSignature } from './middleware/signedRequest.js';
 *
 * router.get('/public/files/:id', requireValidSignature, (req, res) => {
 *    res.sendFile(`/storage/${req.params.id}`);
 * });
 *
 * @example
 * // 2. Запит від клієнта (Node.js):
 * // fetch('https://api.com') -> 200 OK
 * // fetch('https://api.com') -> 403 Forbidden
 */
export const requireValidSignature = (req, res, next) => {
    // Визначаємо IP клієнта (враховуючи проксі)
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress

    const isValid = verifySignatureRaw(req, clientIp)

    if (!isValid) {
        return res.status(403).json({
            error: 'Forbidden',
            code: 'INVALID_SIGNATURE',
            message: 'Цей лінк більше не дійсний або був змінений',
        })
    }

    next()
}
