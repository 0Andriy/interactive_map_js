// src/routes/v1/auth/auth.controller.js
import authService from './auth.service.js'
import { setTokenCookie, clearTokenCookie } from '../../../utils/cookieUtils.js'
import logger from '../../../utils/logger.js'

/**
 * Обробник для реєстрації нового користувача.
 * Після успішної реєстрації автоматично логінить користувача.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function register(req, res) {
    try {
        const { username, email, password, firstName, lastName } = req.body
        // Перевірка на наявність обов'язкових полів
        if (!username || !email || !password) {
            return res.status(400).json({ message: 'Username, email, and password are required.' })
        }

        // 1. Реєструємо користувача
        const newUser = await authService.register({
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
            username,
            password,
            ipAddress,
            userAgent,
        )

        // 3. Встановлюємо refresh token як HTTP-Only cookie для додаткової безпеки (Відповідає терміну дії refresh token)
        setTokenCookie(res, 'refresh', refreshToken)

        // 4. Повертаємо відповідь з токенами та даними користувача
        res.status(201).json({
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
        if (error.message.includes('exists') || error.message.includes('soft-deleted')) {
            return res.status(409).json({ message: error.message }) // 409 Conflict
        }
        res.status(500).json({ message: 'Internal server error during registration.' })
    }
}

/**
 * Обробник для входу користувача.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function login(req, res) {
    try {
        const { username, password } = req.body
        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password are required.' })
        }

        const ipAddress = req.ip // Отримуємо IP-адресу
        const userAgent = req.headers['user-agent'] // Отримуємо User-Agent

        const { user, accessToken, refreshToken } = await authService.login(
            username,
            password,
            ipAddress,
            userAgent,
        )

        // Встановлюємо refresh token як HTTP-Only cookie для додаткової безпеки (Відповідає терміну дії refresh token)
        setTokenCookie(res, 'refresh', refreshToken)

        res.status(200).json({
            message: 'Logged in successfully.',
            user,
            accessToken,
            refreshToken,
        })
    } catch (error) {
        logger.error(`Login error: ${error.message}`, { error })
        if (
            error.message.includes('Invalid credentials') ||
            error.message.includes('inactive') ||
            error.message.includes('deleted')
        ) {
            return res.status(401).json({ message: error.message }) // 401 Unauthorized
        }
        res.status(500).json({ message: 'Internal server error during login.' })
    }
}

/**
 * Обробник для виходу користувача.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function logout(req, res) {
    try {
        const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken
        if (!refreshToken) {
            // Якщо токена немає, вважаємо, що користувач вже не увійшов
            return res.status(200).json({ message: 'Already logged out or no active session.' })
        }

        // Викликаємо сервіс для відкликання токена
        await authService.logout(refreshToken)

        // Очищаємо HTTP-Only cookie з refresh token
        clearTokenCookie(res, 'refresh')

        res.status(200).json({ message: 'Logged out successfully.' })
    } catch (error) {
        logger.error(`Logout error: ${error.message}`, { error })
        res.status(500).json({ message: 'Internal server error during logout.' })
    }
}

/**
 * Обробник для оновлення access та refresh токенів.
 * Використовує refresh token з HTTP-Only cookie.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function refresh(req, res) {
    try {
        const oldRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken

        if (!oldRefreshToken) {
            logger.warn('Refresh failed: No refresh token found in cookies.')
            return res.status(401).json({ message: 'Refresh token not provided.' })
        }

        const ipAddress = req.ip
        const userAgent = req.headers['user-agent']

        const { accessToken, refreshToken } = await authService.refreshTokens(
            oldRefreshToken,
            ipAddress,
            userAgent,
        )

        // Встановлюємо новий refresh token як HTTP-Only cookie
        setTokenCookie(res, 'refresh', refreshToken)

        res.status(200).json({
            message: 'Tokens refreshed successfully.',
            accessToken,
            refreshToken,
        })
    } catch (error) {
        logger.error(`Refresh token error: ${error.message}`, { error })
        if (
            error.message.includes('Invalid') ||
            error.message.includes('revoked') ||
            error.message.includes('expired') ||
            error.message.includes('inactive')
        ) {
            // Очищаємо куки, якщо токен недійсний
            clearTokenCookie(res, 'refresh')

            return res.status(401).json({ message: `Refresh failed: ${error.message}` })
        }
        res.status(500).json({ message: 'Internal server error during token refresh.' })
    }
}

/**
 * Обробник для зміни пароля аутентифікованим користувачем.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function changePassword(req, res) {
    try {
        const { oldPassword, newPassword } = req.body
        const userId = req.user.userId // userId з об'єкта req.user, встановленого authenticateToken middleware

        if (!userId) {
            logger.warn('Attempt to change password without authenticated user (userId missing).')
            return res.status(401).json({ message: 'Unauthorized: User ID not found.' })
        }

        await authService.changePassword(userId, oldPassword, newPassword)

        res.status(200).json({ message: 'Password changed successfully.' })
    } catch (error) {
        logger.error(`Change password error for user ${req.user?.userId}: ${error.message}`, {
            error,
            body: req.body,
        })
        if (error.message.includes('Invalid old password')) {
            return res.status(401).json({ message: error.message })
        }
        if (error.message.includes('New password cannot be the same as the old password')) {
            return res.status(400).json({ message: error.message })
        }
        res.status(500).json({ message: 'Internal server error during password change.' })
    }
}

/**
 * Обробник для запиту на скидання пароля.
 * Надсилає посилання для скидання пароля на вказаний email.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function forgotPasswordRequest(req, res) {
    try {
        const { email } = req.body
        await authService.requestPasswordReset(email)

        // Важливо: для безпеки завжди повертайте однакову відповідь, незалежно від того,
        // чи існує email, щоб уникнути витоку інформації про користувачів.
        res.status(200).json({
            message: 'If an account with that email exists, a password reset link has been sent.',
        })
    } catch (error) {
        logger.error(
            `Forgot password request error for email ${req.body.email}: ${error.message}`,
            { error, body: req.body },
        )
        res.status(500).json({ message: 'Internal server error during password reset request.' })
    }
}

/**
 * Обробник для скидання пароля за допомогою токена.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function resetPassword(req, res) {
    try {
        const { token, newPassword } = req.body

        await authService.resetPassword(token, newPassword)

        res.status(200).json({ message: 'Password has been reset successfully.' })
    } catch (error) {
        logger.error(`Reset password error: ${error.message}`, {
            error,
            body: req.body,
        })
        if (
            error.message.includes('Invalid or expired reset token') ||
            error.message.includes('Reset token already used')
        ) {
            return res.status(400).json({ message: error.message })
        }
        res.status(500).json({ message: 'Internal server error during password reset.' })
    }
}

/**
 * Обробник для активації облікового запису.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function activateAccount(req, res) {
    try {
        const { token } = req.body

        await authService.activateAccount(token)

        res.status(200).json({ message: 'Account activated successfully.' })
    } catch (error) {
        logger.error(`Account activation error: ${error.message}`, {
            error,
            body: req.body,
        })
        if (
            error.message.includes('Invalid or expired activation token') ||
            error.message.includes('Account already active')
        ) {
            return res.status(400).json({ message: error.message })
        }
        res.status(500).json({ message: 'Internal server error during account activation.' })
    }
}

/**
 * Обробник верифікації accessToken надістланим користувачем
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function verifyAccessToken(req, res) {
    try {
        // 1. Спробувати отримати з заголовка Authorization
        let token = req.headers.authorization
        // Формат: "Bearer <token>"
        if (token && token.startsWith('Bearer ')) {
            token = token.split(' ')[1]
        } else {
            // Якщо не знайшли в заголовку або формат невірний, шукаємо в query параметрах
            // 2. Спробувати отримати з параметра запиту
            token = req.query.access_token || req.query.accessToken
            if (!token) {
                // Якщо і там немає, спробувати отримати з тіла запиту (для POST-запитів)
                // 3. Спробувати отримати з тіла запиту
                token = req.body.access_token || req.body.accessToken
            }
        }

        if (!token) {
            res.status(401).json({
                message: 'Токен доступу відсутній у заголовку, параметрі запиту або тілі.',
            })
        }

        const verificationResult = await authService.verifyAccessToken(token)

        res.status(200).json({
            message: 'Результат верифікації AccessToken',
            isValid: verificationResult.isValid,
            payload: verificationResult.payload,
        })
    } catch (error) {
        next(error)
    }
}

/**
 * Тестовий маршрут для аутентифікованих користувачів.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function getProtectedData(req, res) {
    // Дані користувача доступні через req.user завдяки authenticateToken middleware
    try {
        logger.info(`Protected data accessed by user: ${req.user.userId}`)
        res.status(200).json({
            message: 'You have access to protected data!',
            user: {
                userId: req.user.userId,
                username: req.user.username,
                email: req.user.email,
                roles: req.user.roles,
            },
        })
    } catch (error) {
        logger.error(`Error in getProtectedData: ${error.message}`, { error })
        res.status(500).json({ message: 'Internal server error.' })
    }
}

/**
 * Тестовий маршрут для користувачів з роллю 'admin'.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function getAdminData(req, res) {
    // Дані користувача вже доступні через req.user завдяки authenticateToken middleware
    try {
        logger.info(`Admin data accessed by admin user: ${req.user.userId}`)
        res.status(200).json({
            message: 'Welcome, Admin! This is highly sensitive data.',
            user: {
                userId: req.user.userId,
                username: req.user.username,
                roles: req.user.roles,
            },
        })
    } catch (error) {
        logger.error(`Error in getAdminData: ${error.message}`, { error })
        res.status(500).json({ message: 'Internal server error.' })
    }
}
