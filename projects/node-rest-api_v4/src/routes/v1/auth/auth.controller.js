// src/routes/v1/auth/auth.controller.js
import { authService } from './auth.service.js'
import { config } from '../../../config/config.js' // Імпортуємо конфігурацію

const setRefreshTokenCookie = (res, refreshTokenData) => {
    res.cookie('refreshToken', refreshTokenData.token, {
        expires: refreshTokenData.expires,
        httpOnly: config.cookie.httpOnly,
        secure: config.cookie.secure,
        sameSite: config.cookie.sameSite,
        domain: config.cookie.domain,
        path: '/', // Зазвичай токен доступний на всьому сайті
    })
}

const clearRefreshTokenCookie = (res) => {
    res.clearCookie('refreshToken', {
        httpOnly: config.cookie.httpOnly,
        secure: config.cookie.secure,
        sameSite: config.cookie.sameSite,
        domain: config.cookie.domain,
        path: '/',
    })
}

export const registerController = async (req, res, next) => {
    try {
        const { user, tokens, refreshTokenCookie } = await authService.registerUser(req.body)
        setRefreshTokenCookie(res, refreshTokenCookie) // Встановлюємо куку

        res.status(201).json({
            message: 'Користувач успішно зареєстрований.',
            user,
            tokens,
        })
    } catch (error) {
        next(error) // Передаємо помилку далі в ErrorHandler
    }
}

export const loginController = async (req, res, next) => {
    try {
        const { email, password } = req.body
        const { user, tokens, refreshTokenCookie } = await authService.loginUser(email, password)
        res.status(200).json({
            message: 'Успішний вхід.',
            user,
            tokens,
        })
    } catch (error) {
        next(error) // Передаємо помилку далі в ErrorHandler
    }
}

// Оновлення токенів: токен оновлення в тілі запиту
export const refreshTokensFromBodyController = async (req, res, next) => {
    try {
        const oldRefreshToken = req.body.refreshToken // Отримуємо токен з тіла

        const { accessToken, refreshToken } = await authService.refreshAuthTokens(oldRefreshToken) // Сервіс повертає токен для тіла
        res.status(200).json({
            message: 'Токени успішно оновлено (з тіла запиту).',
            accessToken,
            refreshToken, // Повертаємо новий refresh token у відповіді
        })
    } catch (error) {
        next(error)
    }
}

// Оновлення токенів: токен оновлення в куках
export const refreshTokensFromCookieController = async (req, res, next) => {
    try {
        const oldRefreshToken = req.cookies.refreshToken // Отримуємо токен з кук

        if (!oldRefreshToken) {
            return res.status(400).json({
                message: 'Токен оновлення відсутній у куках.',
                code: 'REFRESH_TOKEN_MISSING_COOKIE',
            })
        }

        const { accessToken, refreshTokenCookie } = await authService.refreshAuthTokens(
            oldRefreshToken,
        ) // Сервіс повертає токен для куки
        setRefreshTokenCookie(res, refreshTokenCookie) // Встановлюємо нову куку

        res.status(200).json({
            message: 'Токени успішно оновлено (з куки).',
            accessToken,
            refreshTokenCookie,
        })
    } catch (error) {
        next(error)
    }
}

// Вихід: токен оновлення в тілі запиту
export const logoutFromBodyController = async (req, res, next) => {
    try {
        const refreshToken = req.body.refreshToken

        if (!refreshToken) {
            return res.status(400).json({
                message: 'Токен оновлення відсутній у тілі запиту.',
                code: 'REFRESH_TOKEN_MISSING_BODY',
            })
        }

        await authService.logoutUser(refreshToken)

        res.status(200).json({ message: 'Вихід успішний (токен з тіла запиту).' })
    } catch (error) {
        next(error)
    }
}

// Вихід: токен оновлення в куках
export const logoutFromCookieController = async (req, res, next) => {
    try {
        const refreshToken = req.cookies.refreshToken

        if (!refreshToken) {
            return res.status(400).json({
                message: 'Токен оновлення відсутній у куках.',
                code: 'REFRESH_TOKEN_MISSING_COOKIE',
            })
        }

        await authService.logoutUser(refreshToken)
        clearRefreshTokenCookie(res) // Видаляємо куку

        res.status(200).json({ message: 'Вихід успішний (токен з куки).' })
    } catch (error) {
        next(error)
    }
}

export const logoutAllSessionsController = async (req, res, next) => {
    try {
        const userId = req.user.userId

        await authService.logoutAllSessions(userId)
        clearRefreshTokenCookie(res) // Видаляємо куку після виходу з усіх сесій

        res.status(200).json({ message: 'Всі сесії успішно завершено.' })
    } catch (error) {
        next(error) // Передаємо помилку далі в ErrorHandler
    }
}

export const verifyTokenController = async (req, res, next) => {
    try {
        let token = req.headers.authorization // 1. Спробувати отримати з заголовка Authorization

        if (token && token.startsWith('Bearer ')) {
            // token = token.slice(7, token.length) // Прибрати "Bearer "
            token = token.split(' ')[1]
        } else {
            // Якщо не знайшли в заголовку або формат невірний, шукаємо в query параметрах
            token = req.query.access_token || req.query.accessToken // 2. Спробувати отримати з параметра запиту
            if (!token) {
                // Якщо і там немає, спробувати отримати з тіла запиту (для POST-запитів)
                token = req.body.access_token || req.body.accessToken // 3. Спробувати отримати з тіла запиту
            }
        }

        if (!token) {
            throw new CustomError(
                'Токен доступу відсутній у заголовку, параметрі запиту або тілі.',
                401,
                'ACCESS_TOKEN_MISSING',
            )
        }

        const verificationResult = await authService.verifyAccessToken(token)

        res.status(200).json({
            message: 'Токен дійсний.',
            isValid: verificationResult.isValid,
            payload: verificationResult.payload,
        })
    } catch (error) {
        next(error)
    }
}
