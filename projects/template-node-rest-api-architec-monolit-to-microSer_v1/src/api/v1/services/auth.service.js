// src/api/v1/services/auth.service.js

import * as userGateway from '../gateways/user.gateway.js'
import refreshTokenModel from '../models/refreshToken.model.js'
import { hashPassword, comparePasswords } from '../../../utils/passwordUtils.js'
// import {
//     generateAccessToken,
//     generateRefreshToken,
//     verifyRefreshToken,
//     convertExpirationToMs,
// } from '../../../utils/JwtManager.js'
import jwtManager from '../../../utils/JwtManager.js'
import logger from '../../../utils/logger.js'

class AuthService {
    /**
     * Реєструє нового користувача.
     * @param {string} dbName - Назва бази даних, яка повинна відповідати одному з імен, визначених у файлі конфігурації
     * @param {object} userData - Дані користувача (username, email, password, firstName, lastName).
     * @returns {Promise<object>} Об'єкт користувача без хешу пароля.
     * @throws {Error} Якщо користувач вже існує або виникла помилка реєстрації.
     */
    async register(dbName, userData) {
        try {
            // Перевіряємо, чи користувач вже існує за username або email
            const existingUser =
                (await userGateway.findByUsername(dbName, userData.username, true)) ||
                (await userGateway.findByEmail(dbName, userData.email, true))
            if (existingUser) {
                if (existingUser.DELETED_AT) {
                    throw new Error(
                        'User with this email or username exists but is soft-deleted. Please contact support to restore.',
                    )
                }
                throw new Error('User with this email or username already exists.')
            }

            // Створюємо користувача через модель (пароль хешується всередині моделі)
            const newUser = await userGateway.create(dbName, userData)

            // Видаляємо конфіденційні дані перед поверненням
            delete newUser.PASSWORD_HASH
            delete newUser.SALT

            logger.info(`User registered successfully: ${newUser.username}`)

            return newUser
        } catch (error) {
            logger.error(`Registration failed: ${error.message}`, {
                error,
                username: userData.username,
                email: userData.email,
            })

            throw error
        }
    }

    /**
     * Аутентифікує користувача.
     * @param {string} dbName - Назва бази даних, яка повинна відповідати одному з імен, визначених у файлі конфігурації
     * @param {string} username - Ім'я користувача.
     * @param {string} password - Сирий пароль.
     * @param {string} [ipAddress=null] - IP-адреса для refresh токена.
     * @param {string} [userAgent=null] - User-Agent для refresh токена.
     * @returns {Promise<object>} Об'єкт, що містить access token, refresh token та дані користувача.
     * @throws {Error} Якщо аутентифікація не вдалася (невірні облікові дані, неактивний користувач).
     */
    async login(dbName, username, password, ipAddress = null, userAgent = null) {
        try {
            const user = await userGateway.findByUsername(dbName, username)

            if (!user) {
                logger.warn(`Login failed: User '${username}' not found.`)
                throw new Error('Invalid credentials')
            }

            if (!user.IS_ACTIVE) {
                logger.warn(`Login failed: User '${username}' is inactive.`)
                throw new Error('Account is inactive. Please contact support.')
            }

            if (user.DELETED_AT) {
                logger.warn(`Login failed: User '${username}' is soft-deleted.`)
                throw new Error('Account is deleted. Please contact support to restore.')
            }

            // Порівнюємо наданий пароль з хешованим паролем з БД
            const isPasswordValid = await comparePasswords(password, user.PASSWORD_HASH)

            if (!isPasswordValid) {
                logger.warn(`Login failed: Invalid password for user '${username}'.`)
                throw new Error('Invalid credentials')
            }

            // Оновлюємо LAST_LOGIN_AT
            await userGateway.update(dbName, user.USER_ID, { LAST_LOGIN_AT: new Date() })

            // Генеруємо токени
            const accessTokenPayload = {
                userId: user.USER_ID,
                username: user.USERNAME,
                email: user.EMAIL,
                roles: user.ROLES, // Додаємо ролі до Access Token
            }
            // const accessToken = await generateAccessToken(accessTokenPayload)
            const accessToken = await jwtManager.sign(accessTokenPayload, 'access')

            const refreshTokenPayload = {
                userId: user.USER_ID,
            }
            // const refreshToken = await generateRefreshToken(refreshTokenPayload)
            const refreshToken = await jwtManager.sign(refreshTokenPayload, 'refresh')

            // Зберігаємо refresh token у базі даних
            // Отримуємо термін дії refresh токена для збереження в БД
            // const refreshTokenExpirationMilliseconds = convertExpirationToMs(
            //     process.env.JWT_REFRESH_TOKEN_EXPIRATION,
            // )
            const refreshTokenExpirationMilliseconds = jwtManager.convertExpirationToMs(
                jwtManager.config.tokenTypes.refresh.expiresIn,
            )
            const refreshTokenExpirationDate = new Date(
                Date.now() + refreshTokenExpirationMilliseconds,
            )

            await refreshTokenModel.create(dbName, {
                userId: user.USER_ID,
                token: refreshToken,
                expirationDate: refreshTokenExpirationDate,
                ipAddress: ipAddress,
                userAgent: userAgent,
            })

            // Видаляємо конфіденційні дані перед поверненням
            delete user.PASSWORD_HASH
            delete user.SALT

            logger.info(`User '${username}' logged in successfully.`)

            return {
                user,
                accessToken,
                refreshToken,
            }
        } catch (error) {
            logger.error(`Login process failed for user '${username}': ${error.message}`, { error })
            throw error
        }
    }

    /**
     * Здійснює вихід користувача, відкликаючи refresh token.
     * @param {string} dbName - Назва бази даних, яка повинна відповідати одному з імен, визначених у файлі конфігурації
     * @param {string} refreshToken - Refresh token для відкликання.
     * @returns {Promise<boolean>} True, якщо вихід успішний.
     * @throws {Error} Якщо виникла помилка.
     */
    async logout(dbName, refreshToken) {
        try {
            // Перевіряємо валідність токена, щоб отримати userId, якщо потрібно
            let userId = null
            try {
                // const decodedToken = await verifyRefreshToken(refreshToken)
                const decodedToken = await jwtManager.verify(refreshToken, 'refresh')
                if (!decodedToken) throw new Error('Недійсний або відсутній токен оновлення.')
                userId = decodedToken.userId
            } catch (err) {
                logger.warn(`Logout attempt with invalid refresh token: ${err.message}`)
                // Якщо токен недійсний, ми все одно спробуємо його відкликати на всякий випадок.
                // Якщо його не було в БД, revoke поверне false, що і так означає, що "вихід" вже відбувся.
            }

            const success = await refreshTokenModel.revoke(dbName, refreshToken)
            if (success) {
                logger.info(`User ${userId || 'unknown'} logged out successfully (token revoked).`)
            } else {
                logger.warn(
                    `Logout: Refresh token not found or already revoked. User ID: ${
                        userId || 'unknown'
                    }.`,
                )
            }

            return success
        } catch (error) {
            logger.error(`Logout failed: ${error.message}`, { error })
            throw error
        }
    }

    /**
     * Оновлює access та refresh токени.
     * @param {string} dbName - Назва бази даних, яка повинна відповідати одному з імен, визначених у файлі конфігурації
     * @param {string} oldRefreshToken - Старий refresh token.
     * @param {string} [ipAddress=null] - IP-адреса нового запиту.
     * @param {string} [userAgent=null] - User-Agent нового запиту.
     * @returns {Promise<object>} Об'єкт, що містить новий access token та новий refresh token.
     * @throws {Error} Якщо refresh token недійсний, прострочений або відкликаний.
     */
    async refreshTokens(dbName, oldRefreshToken, ipAddress = null, userAgent = null) {
        try {
            // 1. Перевіряємо старий refresh token на валідність (підпис, термін дії)
            // const decodedToken = await verifyRefreshToken(oldRefreshToken)
            const decodedToken = await jwtManager.verify(oldRefreshToken, 'refresh')
            if (!decodedToken) throw new Error('Недійсний або відсутній токен оновлення.')
            const userId = decodedToken.userId

            // 2. Шукаємо refresh token у базі даних
            const storedRefreshToken = await refreshTokenModel.findByToken(dbName, oldRefreshToken)

            if (!storedRefreshToken || storedRefreshToken.IS_REVOKED) {
                // Якщо токен не знайдено в БД (можливо, вже відкликано, або не існує)
                logger.warn(
                    `Refresh token not found in DB or already revoked for user ${userId}. Token: ${oldRefreshToken.substring(
                        0,
                        20,
                    )}...`,
                )
                // Важливо! Можливо, хтось намагається використати старий токен, який вже був відкликаний.
                // Для додаткової безпеки можна відкликати всі токени для цього користувача, якщо це підозра на компрометацію.
                if (userId) {
                    await this.revokeAllUserTokens(userId)
                }
                throw new Error('Invalid or revoked refresh token.')
            }

            // if (storedRefreshToken.IS_REVOKED) {
            //     logger.warn(
            //         `Refresh token already revoked in DB for user ${userId}. Token: ${oldRefreshToken.substring(
            //             0,
            //             20,
            //         )}...`,
            //     )
            //     throw new Error('Refresh token has been revoked.')
            // }

            if (storedRefreshToken.EXPIRATION_DATE < new Date()) {
                logger.warn(
                    `Refresh token expired in DB for user ${userId}. Token: ${oldRefreshToken.substring(
                        0,
                        20,
                    )}...`,
                )
                // Опціонально: видалити його з БД, якщо він прострочений
                await refreshTokenModel.revoke(dbName, oldRefreshToken)
                throw new Error('Refresh token expired.')
            }

            // 3. Отримуємо дані користувача для нового access token
            const user = await userGateway.findById(dbName, userId)
            if (!user || !user.IS_ACTIVE || user.DELETED_AT) {
                logger.warn(`User ${userId} not found, inactive or deleted during token refresh.`)
                // Відкликаємо старий токен, якщо користувача більше немає
                await refreshTokenModel.revoke(dbName, oldRefreshToken)
                throw new Error('User account not found or is inactive.')
            }

            // 4. Відкликаємо старий refresh token (одноразове використання або ротація)
            // Це важливо для підвищення безпеки: після використання старий RT стає недійсним.
            await refreshTokenModel.revoke(dbName, oldRefreshToken)

            // 5. Генеруємо нові токени
            const newAccessTokenPayload = {
                userId: user.USER_ID,
                username: user.USERNAME,
                email: user.EMAIL,
                roles: user.ROLES,
            }
            // const newAccessToken = await generateAccessToken(newAccessTokenPayload)
            const newAccessToken = await jwtManager.sign(newAccessTokenPayload, 'access')

            const newRefreshTokenPayload = {
                userId: user.USER_ID,
            }
            // const newRefreshToken = await generateRefreshToken(newRefreshTokenPayload)
            const newRefreshToken = await jwtManager.sign(newRefreshTokenPayload, 'refresh')

            // Отримуємо термін дії нового refresh токена для збереження в БД
            // const newRefreshTokenExpirationMilliseconds = convertExpirationToMs(
            //     process.env.JWT_REFRESH_TOKEN_EXPIRATION,
            // )
            const newRefreshTokenExpirationMilliseconds = jwtManager.convertExpirationToMs(
                jwtManager.config.tokenTypes.refresh.expiresIn,
            )
            const newRefreshTokenExpirationDate = new Date(
                Date.now() + newRefreshTokenExpirationMilliseconds,
            )

            // 6. Зберігаємо новий refresh token у базі даних
            await refreshTokenModel.create(dbName, {
                userId: user.USER_ID,
                token: newRefreshToken,
                expirationDate: newRefreshTokenExpirationDate,
                ipAddress: ipAddress,
                userAgent: userAgent,
            })

            logger.info(`Tokens refreshed for user ${userId}.`)

            return {
                accessToken: newAccessToken,
                refreshToken: newRefreshToken,
            }
        } catch (error) {
            logger.error(`Token refresh failed: ${error.message}`, { error })
            throw error
        }
    }

    /**
     * Відкликає всі refresh токени для певного користувача (наприклад, при зміні пароля).
     * @param {string} dbName - Назва бази даних, яка повинна відповідати одному з імен, визначених у файлі конфігурації
     * @param {number} userId - ID користувача.
     * @returns {Promise<number>} Кількість відкликаних токенів.
     * @throws {Error} Якщо виникла помилка.
     */
    async revokeAllUserTokens(dbName, userId) {
        try {
            const revokedCount = await refreshTokenModel.revokeAllForUser(dbName, userId)
            logger.info(`All refresh tokens for user ${userId} revoked. Count: ${revokedCount}`)

            return revokedCount
        } catch (error) {
            logger.error(`Failed to revoke all tokens for user ${userId}: ${error.message}`, {
                error,
            })
            throw error
        }
    }

    /**
     * Змінює пароль користувача.
     * @param {string} dbName - Назва бази даних, яка повинна відповідати одному з імен, визначених у файлі конфігурації
     * @param {number} userId - ID користувача.
     * @param {string} oldPassword - Поточний пароль користувача.
     * @param {string} newPassword - Новий пароль користувача.
     * @returns {Promise<void>}
     * @throws {Error} Якщо старий пароль невірний або новий пароль такий самий, як старий.
     */
    async changePassword(dbName, userId, oldPassword, newPassword) {
        try {
            const user = await userGateway.findById(dbName, userId)
            if (!user) {
                logger.warn(`Change password failed: User ${userId} not found.`)
                throw new Error('User not found.')
            }

            const isPasswordValid = await comparePasswords(oldPassword, user.PASSWORD_HASH)
            if (!isPasswordValid) {
                logger.warn(`Change password failed for user ${userId}: Invalid old password.`)
                throw new Error('Invalid old password.')
            }

            const isNewPasswordSame = await comparePasswords(newPassword, user.PASSWORD_HASH)
            if (isNewPasswordSame) {
                logger.warn(
                    `Change password failed for user ${userId}: New password is same as old.`,
                )
                throw new Error('New password cannot be the same as the old password.')
            }

            const hashedNewPassword = await hashPassword(newPassword)
            await userGateway.update(dbName, userId, { PASSWORD_HASH: hashedNewPassword })

            // Після зміни пароля відкликаємо всі токени користувача для безпеки
            await this.revokeAllUserTokens(dbName, userId)

            logger.info(`Password successfully changed for user ${userId}. All tokens revoked.`)
        } catch (error) {
            logger.error(`Change password service failed for user ${userId}: ${error.message}`, {
                error,
            })
            throw error
        }
    }

    /**
     * Здійснює верифікацію AccessToken.
     * @param {string} accessToken - Access token для верифікації.
     * @returns {Promise<object>} Об'єкт, що містить isValid і вміст токена
     * @throws {Error} Якщо виникла помилка.
     */
    async verifyAccessToken(accessToken) {
        try {
            // Перевіряємо валідність токена
            let isValid = false
            let payload = {}
            try {
                const decodedToken = await jwtManager.verify(accessToken, 'access')
                if (decodedToken) {
                    isValid = true
                    payload = decodedToken
                }
            } catch (err) {
                logger.warn(`Verify attempt with invalid access token: ${err.message}`)
            }

            return {
                isValid,
                payload,
            }
        } catch (error) {
            logger.error(`Logout failed: ${error.message}`, { error })
            throw error
        }
    }
}

export default new AuthService()
