// middleware/autoAuth.js
import { URL } from 'url'

export const autoAuthByToken = (verifyTokenFn) => {
    return async (req, res, next) => {
        const token = req.query.token

        if (!token) {
            return next()
        }

        try {
            // 1. Викликаємо вашу функцію перевірки (передається як аргумент)
            const user = await verifyTokenFn(token)

            if (user) {
                // 2. Встановлюємо авторизаційну куку (або іншу вашу логіку)
                res.cookie('auth_token', token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'Lax',
                    maxAge: 24 * 60 * 60 * 1000, // 24 години
                })

                // 3. Формуємо чистий URL без токена
                const url = new URL(req.originalUrl, `${req.protocol}://${req.get('host')}`)
                url.searchParams.delete('token')

                // 4. Редірект на той самий шлях з усіма іншими параметрами
                const cleanUrl = url.pathname + url.search
                return res.redirect(cleanUrl)
            }
        } catch (error) {
            console.error('Auto-auth error:', error.message)
            // Якщо токен битий — просто ігноруємо і йдемо далі
        }

        next()
    }
}
