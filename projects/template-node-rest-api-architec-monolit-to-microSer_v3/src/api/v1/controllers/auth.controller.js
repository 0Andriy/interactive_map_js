// src/api/v1/routes/auth/auth.controller.js

import authService from '../services/auth.service.js'
import { setTokenCookie, clearTokenCookie } from '../../../utils/cookieUtils.js'
import loggerModule from '../../../utils/logger.js'
const logger = loggerModule.getLoggerForService('auth-service')

/**
 * Обробник для реєстрації нового користувача.
 * Після успішної реєстрації автоматично логінить користувача.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function register(req, res, next) {
    try {
        const dbName = req.dbName

        const { username, email, password, firstName, lastName } = req.body
        // Перевірка на наявність обов'язкових полів
        if (!username || !email || !password) {
            return res.status(400).json({ message: 'Username, email, and password are required.' })
        }

        // 1. Реєструємо користувача
        const newUser = await authService.register(dbName, {
            username,
            email,
            password,
            firstName,
            lastName,
        })

        // 2. Автоматично логінимо щойно зареєстрованого користувача
        const ipAddress = req.ip
        const userAgent = req.headers['user-agent']

        // Викликаємо метод login з authService.
        // Передаємо username та оригінальний сирий пароль,
        // а також IP та User-Agent для збереження refresh token.
        const { user, accessToken, refreshToken } = await authService.login(
            dbName,
            username,
            password,
            ipAddress,
            userAgent,
        )

        // 3. Встановлюємо refresh token як HTTP-Only cookie для додаткової безпеки (Відповідає терміну дії refresh token)
        setTokenCookie(res, 'refresh', refreshToken)

        // 4. Повертаємо відповідь з токенами та даними користувача
        return res.status(201).json({
            message: 'User registered and logged in successfully.',
            user: {
                userId: user.USER_ID,
                username: user.USERNAME,
                email: user.EMAIL,
                firstName: user.FIRST_NAME,
                lastName: user.LAST_NAME,
                isEmailVerified: user.IS_EMAIL_VERIFIED,
                isActive: user.IS_ACTIVE,
                roles: user.ROLES,
            }, // Повертаємо дані користувача з об'єкта, отриманого від логіну
            accessToken: accessToken,
            refreshToken: refreshToken,
        })
    } catch (error) {
        logger.error(`Registration error: ${error.message}`, { error })
        // Обробка відомих помилок з сервісу
        next(error)
    }
}

/**
 * Обробник для входу користувача.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function login(req, res, next) {
    try {
        const dbName = req.dbName

        const { username, password } = req.body
        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password are required.' })
        }

        const ipAddress = req.ip // Отримуємо IP-адресу
        const userAgent = req.headers['user-agent'] // Отримуємо User-Agent

        const { user, accessToken, refreshToken } = await authService.login(
            dbName,
            username,
            password,
            ipAddress,
            userAgent,
        )

        // Встановлюємо refresh token як HTTP-Only cookie для додаткової безпеки (Відповідає терміну дії refresh token)
        setTokenCookie(res, 'refresh', refreshToken)

        return res.status(200).json({
            message: 'Logged in successfully.',
            user,
            accessToken,
            refreshToken,
        })
    } catch (error) {
        logger.error(`Login error: ${error.message}`, { error })
        next(error)
    }
}

/**
 * Обробник для виходу користувача.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function logout(req, res, next) {
    try {
        const dbName = req.dbName

        const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken
        if (!refreshToken) {
            // Якщо токена немає, вважаємо, що користувач вже не увійшов
            return res.status(200).json({ message: 'Already logged out or no active session.' })
        }

        // Викликаємо сервіс для відкликання токена
        await authService.logout(dbName, refreshToken)

        // Очищаємо HTTP-Only cookie з refresh token
        clearTokenCookie(res, 'refresh')

        return res.status(200).json({ message: 'Logged out successfully.' })
    } catch (error) {
        logger.error(`Logout error: ${error.message}`, { error })
        next(error)
    }
}

/**
 * Обробник для оновлення access та refresh токенів.
 * Використовує refresh token з HTTP-Only cookie.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function refresh(req, res, next) {
    try {
        const dbName = req.dbName

        const oldRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken

        if (!oldRefreshToken) {
            logger.warn('Refresh failed: No refresh token found in cookies.')
            return res.status(401).json({ message: 'Refresh token not provided.' })
        }

        const ipAddress = req.ip
        const userAgent = req.headers['user-agent']

        const { accessToken, refreshToken } = await authService.refreshTokens(
            dbName,
            oldRefreshToken,
            ipAddress,
            userAgent,
        )

        // Встановлюємо новий refresh token як HTTP-Only cookie
        setTokenCookie(res, 'refresh', refreshToken)

        return res.status(200).json({
            message: 'Tokens refreshed successfully.',
            accessToken,
            refreshToken,
        })
    } catch (error) {
        logger.error(`Refresh token error: ${error.message}`, { error })
        next(error)
    }
}

// /**
//  * Обробник для зміни пароля аутентифікованим користувачем.
//  * @param {import('express').Request} req
//  * @param {import('express').Response} res
//  * @param {import('express').NextFunction} next
//  */
// export async function changePassword(req, res, next) {
//     try {
//         const dbName = req.dbName

//         const { oldPassword, newPassword } = req.body
//         const userId = req.user.userId // userId з об'єкта req.user, встановленого authenticateToken middleware

//         if (!userId) {
//             logger.warn('Attempt to change password without authenticated user (userId missing).')
//             return res.status(401).json({ message: 'Unauthorized: User ID not found.' })
//         }

//         await authService.changePassword(dbName, userId, oldPassword, newPassword)

//         res.status(200).json({ message: 'Password changed successfully.' })
//     } catch (error) {
//         logger.error(`Change password error for user ${req.user?.userId}: ${error.message}`, {
//             error,
//             body: req.body,
//         })
//         if (error.message.includes('Invalid old password')) {
//             return res.status(401).json({ message: error.message })
//         }
//         if (error.message.includes('New password cannot be the same as the old password')) {
//             return res.status(400).json({ message: error.message })
//         }
//         res.status(500).json({ message: 'Internal server error during password change.' })
//     }
// }

/**
 * Обробник верифікації accessToken надістланим користувачем
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function verifyAccessToken(req, res, next) {
    try {
        // 1. Спробувати отримати з заголовка Authorization
        let token = req.headers.authorization

        // Формат: "Bearer <token>"
        if (token && token.startsWith('Bearer ')) {
            token = token.split(' ')[1]
        } else {
            // Якщо не знайшли в заголовку або формат невірний, шукаємо в query параметрах
            // 2. Спробувати отримати з параметра запиту
            token = req.query?.access_token || req.query?.accessToken
            if (!token) {
                // Якщо і там немає, спробувати отримати з тіла запиту (для POST-запитів)
                // 3. Спробувати отримати з тіла запиту
                token = req.body?.access_token || req.body?.accessToken
            }
        }

        if (!token) {
            // Обов'язково через return, щоб не продовжувати виконання і не вионався res.status(200) бо буде hтtp 200 з помилкою
            return res.status(401).json({
                message: 'Токен доступу відсутній у заголовку, параметрі запиту або тілі.',
            })
        }

        const verificationResult = await authService.verifyAccessToken(token)

        return res.status(200).json({
            message: 'Результат верифікації AccessToken',
            isValid: verificationResult.isValid,
            payload: verificationResult.payload,
        })
    } catch (error) {
        next(error)
    }
}
