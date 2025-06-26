// src/routes/v1/auth/auth.service.js
import { User } from '../../../models/user.model.js'
import { RefreshToken } from '../../../models/refreshToken.model.js'
import { comparePassword } from '../../../utils/bcrypt.js'
// import { generateAccessToken, generateRefreshToken, verifyToken } from '../../../utils/jwt.js'
import jwtManager from '../../../utils/JwtManager.js'
import { config } from '../../../config/index.js'
import { CustomError } from '../../../middleware/globalErrorHandler.js'

export const authService = {
    async registerUser(userData) {
        const existingUserByEmail = await User.findByEmail(userData.email)
        if (existingUserByEmail) {
            throw new CustomError('Користувач з таким email вже існує.', 409, 'DUPLICATE_EMAIL')
        }
        const existingUserByUsername = await User.findByUsername(userData.username)
        if (existingUserByUsername) {
            throw new CustomError(
                "Користувач з таким ім'ям користувача вже існує.",
                409,
                'DUPLICATE_USERNAME',
            )
        }

        const newUser = await User.createUser(userData)

        const accessToken = generateAccessToken({ userId: newUser.id, roles: newUser.roles })
        const refreshToken = generateRefreshToken({ userId: newUser.id })

        const refreshExpirationMs = config.jwt.refreshExpirationDays * 24 * 60 * 60 * 1000
        await RefreshToken.create(newUser.id, refreshToken, refreshExpirationMs)

        return {
            user: {
                id: newUser.id,
                username: newUser.username,
                email: newUser.email,
                roles: newUser.roles,
            },
            tokens: {
                accessToken,
                refreshToken,
            },
            refreshTokenCookie: {
                // Повертаємо інформацію для встановлення куки
                token: refreshToken,
                expires: new Date(Date.now() + refreshExpirationMs),
            },
        }
    },

    async loginUser(email, password) {
        const user = await User.findByEmail(email)
        if (!user) {
            throw new CustomError('Невірний email або пароль.', 401, 'INVALID_CREDENTIALS')
        }

        const isMatch = await comparePassword(password, user.PASSWORD)
        if (!isMatch) {
            throw new CustomError('Невірний email або пароль.', 401, 'INVALID_CREDENTIALS')
        }

        const accessToken = generateAccessToken({ userId: user.ID, roles: user.ROLES })
        const refreshToken = generateRefreshToken({ userId: user.ID })

        // Відкликаємо всі попередні refresh токени для цього користувача
        await RefreshToken.deleteByUserId(user.ID)

        const refreshExpirationMs = config.jwt.refreshExpirationDays * 24 * 60 * 60 * 1000
        await RefreshToken.create(user.ID, refreshToken, refreshExpirationMs)

        return {
            user: {
                id: user.ID,
                username: user.USERNAME,
                email: user.EMAIL,
                roles: user.ROLES,
            },
            tokens: {
                accessToken,
                refreshToken,
            },
            refreshTokenCookie: {
                // Повертаємо інформацію для встановлення куки
                token: refreshToken,
                expires: new Date(Date.now() + refreshExpirationMs),
            },
        }
    },

    async refreshAuthTokens(oldRefreshToken) {
        try {
            const decoded = verifyToken(oldRefreshToken)
            const userId = decoded.userId || decoded.ID // userId тепер NUMBER

            const storedToken = await RefreshToken.findByToken(oldRefreshToken)

            if (!storedToken || storedToken.USER_ID !== userId) {
                throw new CustomError('Недійсний токен оновлення.', 403, 'INVALID_REFRESH_TOKEN')
            }

            if (new Date(storedToken.EXPIRES_AT) < new Date()) {
                await RefreshToken.deleteById(storedToken.ID)
                throw new CustomError(
                    'Термін дії токена оновлення минув.',
                    403,
                    'REFRESH_TOKEN_EXPIRED',
                )
            }

            // Отримати дані користувача, щоб створити новий accessToken з актуальними ролями
            // Припускаємо, що у вас є метод findById або аналогічний, або email є в токені
            // Якщо user.findByEmail(decoded.email) не працює (email немає в токені)
            // то потрібно знайти користувача за ID: User.findById(userId)
            const user = await User.findByEmail(decoded.email || 'not-found@example.com') // Залежить від того, що ви зберігаєте в JWT
            if (!user) {
                throw new CustomError(
                    'Користувач не знайдений для токена оновлення.',
                    404,
                    'USER_NOT_FOUND',
                )
            }
            // Або:
            // const user = await User.findById(userId);
            // if (!user) { ... }

            const newAccessToken = generateAccessToken({ userId: user.ID, roles: user.ROLES })
            const newRefreshToken = generateRefreshToken({ userId: user.ID })

            await RefreshToken.deleteById(storedToken.ID) // Видаляємо старий токен оновлення
            const refreshExpirationMs = config.jwt.refreshExpirationDays * 24 * 60 * 60 * 1000
            await RefreshToken.create(user.ID, newRefreshToken, refreshExpirationMs)

            return {
                accessToken: newAccessToken,
                refreshToken: newRefreshToken,
                refreshTokenCookie: {
                    // Повертаємо інформацію для встановлення куки
                    token: newRefreshToken,
                    expires: new Date(Date.now() + refreshExpirationMs),
                },
            }
        } catch (error) {
            if (error instanceof CustomError) {
                throw error
            }
            if (error.name === 'TokenExpiredError') {
                throw new CustomError(
                    'Термін дії токена оновлення минув.',
                    403,
                    'REFRESH_TOKEN_EXPIRED',
                )
            }
            if (error.name === 'JsonWebTokenError') {
                throw new CustomError('Недійсний токен оновлення.', 403, 'INVALID_REFRESH_TOKEN')
            }
            throw new CustomError('Не вдалося оновити токени.', 500, 'TOKEN_REFRESH_FAILED')
        }
    },

    async logoutUser(refreshToken) {
        const deleted = await RefreshToken.deleteByToken(refreshToken)
        if (!deleted) {
            throw new CustomError(
                'Токен оновлення не знайдено або вже відкликано.',
                404,
                'REFRESH_TOKEN_NOT_FOUND',
            )
        }
        return true
    },

    async logoutAllSessions(userId) {
        const deleted = await RefreshToken.deleteByUserId(userId)
        return deleted
    },

    async verifyAccessToken(token) {
        if (!token) {
            throw new CustomError('Токен доступу відсутній.', 401, 'ACCESS_TOKEN_MISSING')
        }

        // Тут ми прибираємо логіку 'Bearer ' з сервісу,
        // оскільки контролер вже повинен надати "чистий" токен
        // або ми це зробимо в контролері.
        // Якщо токен приходить з query, він вже не матиме 'Bearer '.
        // Залишимо, як було, якщо очікуємо, що контролер вже "очистив" його.
        // Або можна адаптувати, щоб сервіс сам "очищав" від "Bearer ".
        // Залишимо "очистку" в контролері для більшої гнучкості.

        try {
            const decoded = verifyToken(token)
            return {
                isValid: true,
                payload: {
                    // userId: decoded.userId || decoded.ID,
                    // roles: decoded.roles || decoded.ROLES,
                    // exp: decoded.exp,

                    ...decoded,
                },
            }
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                throw new CustomError('Термін дії токена минув.', 401, 'TOKEN_EXPIRED')
            }
            if (error.name === 'JsonWebTokenError') {
                throw new CustomError('Недійсний токен.', 401, 'INVALID_TOKEN')
            }
            if (error instanceof CustomError) {
                throw error
            }
            throw new CustomError('Помилка верифікації токена.', 500, 'TOKEN_VERIFICATION_FAILED')
        }
    },
}
