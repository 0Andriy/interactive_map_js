// src/routes/v1/auth/auth.controller.js
import { authService } from './auth.service.js'
import config from '../../../config/config.js' // Імпортуємо конфігурацію

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
    // 1. Перевірка, чи користувач з таким email або username вже існує
    // 2. Хешування пароля
    // 3. Створення нового користувача в базі даних
    // 4. Генерація Access Token та Refresh Token
    // 5. Збереження Refresh Token у базі даних (пов'язати з користувачем)
    // 6. Встановлення Refresh Token як HttpOnly Cookie
    // 7. Відправка листа для верифікації email (опціонально, але рекомендується)
    // 8. Відповідь з Access Token (і, можливо, інформацією про користувача)

    try {
        const { user, tokens, refreshTokenCookie } = await authService.registerUдаваser(req.body)

        // Встановлюємо куку
        setRefreshTokenCookie(res, refreshTokenCookie)

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
    // 1. Пошук користувача за email
    // 2. Порівняння хешованого пароля
    // 3. Перевірка статусу верифікації (якщо потрібно)
    // 4. Генерація Access Token та Refresh Token
    // 5. Збереження Refresh Token у базі даних
    // 6. Встановлення Refresh Token як HttpOnly Cookie
    // 7. Відповідь з Access Token

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

// Вихід: токен оновлення в тілі запиту
export const logoutController = async (req, res, next) => {
    try {
        const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken

        if (!refreshToken) {
            return res.status(400).json({
                message: 'Токен оновлення відсутній.',
                code: 'REFRESH_TOKEN_MISSING_BODY',
            })
        }

        await authService.logoutUser(refreshToken)

        // Видаляємо куку
        clearRefreshTokenCookie(res)

        res.status(200).json({ message: 'Вихід успішний (токен з тіла запиту).' })
    } catch (error) {
        next(error)
    }
}

// Оновлення токенів: токен оновлення в тілі запиту
export const refreshTokensFromBodyController = async (req, res, next) => {
    // 1. Перевірка Refresh Token (чи дійсний, чи є в базі даних)
    // 2. Якщо Refresh Token дійсний:
    //    a. Анулювати старий Refresh Token (для посилення безпеки - Rotation)
    //    b. Згенерувати новий Access Token та новий Refresh Token
    //    c. Зберегти новий Refresh Token у базі даних
    // 3. Відповідь з новим Access Token (і, можливо, новим Refresh Token у body)

    try {
        const oldRefreshToken = req.body.refreshToken // Отримуємо токен з тіла

        if (!oldRefreshToken) {
            return res.status(400).json({
                message: 'Токен оновлення відсутній у куках.',
                code: 'REFRESH_TOKEN_MISSING_BODY',
            })
        }

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
    // 1. Перевірка Refresh Token з cookie (чи дійсний, чи є в базі даних)
    // 2. Якщо Refresh Token дійсний:
    //    a. Анулювати старий Refresh Token (Rotation)
    //    b. Згенерувати новий Access Token та новий Refresh Token
    //    c. Зберегти новий Refresh Token у базі даних
    //    d. Встановити новий Refresh Token як HttpOnly Cookie
    // 3. Відповідь з новим Access Token

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

        // Встановлюємо нову куку
        setRefreshTokenCookie(res, refreshTokenCookie)

        res.status(200).json({
            message: 'Токени успішно оновлено (з куки).',
            accessToken,
            refreshTokenCookie,
        })
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

        // Видаляємо куку
        clearRefreshTokenCookie(res)

        res.status(200).json({ message: 'Вихід успішний (токен з куки).' })
    } catch (error) {
        next(error)
    }
}

export const logoutAllSessionsController = async (req, res, next) => {
    try {
        const userId = req.user.userId

        await authService.logoutAllSessions(userId)

        // Видаляємо куку після виходу з усіх сесій
        clearRefreshTokenCookie(res)

        res.status(200).json({ message: 'Всі сесії успішно завершено.' })
    } catch (error) {
        next(error) // Передаємо помилку далі в ErrorHandler
    }
}

export const verifyTokenController = async (req, res, next) => {
    try {
        let token = req.headers.authorization // 1. Спробувати отримати з заголовка Authorization
        // Формат: "Bearer <token>"
        if (token && token.startsWith('Bearer ')) {
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

export const forgotPasswordController = async (req, res, next) => {
    try {
        const { email } = req.body
        // 1. Пошук користувача за email
        // 2. Генерація унікального, короткоживучого токена для відновлення пароля
        // 3. Збереження токена (з терміном дії) у базі даних, пов'язавши його з користувачем
        // 4. Надсилання листа на email користувача з посиланням, що містить цей токен
        // await sendPasswordResetEmail(email, resetToken);
        res.status(200).json({
            message: 'If the email is registered, a password reset link has been sent.',
        })
    } catch (error) {
        next(error)
    }
}

export const resetPasswordController = async (req, res, next) => {
    try {
        const { token } = req.params
        const { newPassword, confirmNewPassword } = req.body
        // 1. Валідація токена (чи дійсний, чи не прострочений, чи є в базі даних)
        // 2. Перевірка, чи newPassword та confirmNewPassword співпадають
        // 3. Хешування нового пароля
        // 4. Оновлення пароля користувача в базі даних
        // 5. Деактивація/видалення токена відновлення пароля з бази даних
        res.status(200).json({ message: 'Password has been reset successfully.' })
    } catch (error) {
        // next(new AppError('Invalid or expired reset token', 404));
        next(error)
    }
}

export const verifyEmailController = async (req, res, next) => {
    try {
        const { token } = req.params
        // 1. Перевірка токена верифікації (чи дійсний, чи не прострочений)
        // 2. Пошук користувача, пов'язаного з цим токеном
        // 3. Оновлення статусу користувача на 'verified' у базі даних
        // 4. Деактивація/видалення токена верифікації
        res.status(200).json({ message: 'Email successfully verified!' })
    } catch (error) {
        // next(new AppError('Invalid or expired verification token', 400));
        next(error)
    }
}

export const resendVerificationEmailController = async (req, res, next) => {
    try {
        const { email } = req.body
        // 1. Пошук користувача за email
        // 2. Перевірка, чи email вже не верифікований
        // 3. Генерація нового токена верифікації
        // 4. Надсилання нового листа верифікації
        // await sendVerificationEmail(email, newToken);
        res.status(200).json({
            message: 'Verification email sent if account exists and is not verified.',
        })
    } catch (error) {
        next(error)
    }
}

export const changePasswordController = async (req, res, next) => {
    try {
        // User information should be available from authMiddleware (e.g., req.user.id)
        const userId = req.user.id // Assuming user ID is attached by authMiddleware
        const { currentPassword, newPassword, confirmNewPassword } = req.body

        // 1. Fetch user by userId
        // 2. Compare currentPassword with hashed password in DB
        // 3. Validate newPassword and confirmNewPassword match
        // 4. Hash newPassword
        // 5. Update user's password in DB
        // 6. (Optional but recommended) Invalidate all or some of the user's refresh tokens to force re-login

        res.status(200).json({ message: 'Password changed successfully.' })
    } catch (error) {
        // Handle specific errors like "Incorrect current password"
        // next(new AppError('Incorrect current password', 401));
        next(error)
    }
}
