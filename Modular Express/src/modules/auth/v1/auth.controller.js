/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Авторизація та автентифікація
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     AuthResponse:
 *       type: object
 *       properties:
 *         accessToken: { type: string }
 *         refreshToken: { type: string }
 *         user: { $ref: '#/components/schemas/UserResponse' }
 */

class AuthController {
    /**
     * @param {AuthService} authService
     */
    constructor(authService) {
        this.authService = authService
    }

    /**
     * @swagger
     * /api/auth/register:
     *   post:
     *     summary: Реєстрація нового користувача
     *     tags: [Auth]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema: { $ref: '#/components/schemas/UserCreateRequest' }
     *     responses:
     *       201:
     *         description: Користувач успішно створений
     */
    async register(req, res, next) {
        try {
            const result = await this.authService.register(req.body)
            res.status(201).json(result)
        } catch (error) {
            next(error)
        }
    }

    /**
     * @swagger
     * /api/auth/login:
     *   post:
     *     summary: Вхід у систему
     *     tags: [Auth]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema: { $ref: '#/components/schemas/LoginRequest' }
     *     responses:
     *       200:
     *         schema: { $ref: '#/components/schemas/AuthResponse' }
     */
    async login(req, res, next) {
        try {
            const { username, password } = req.body
            const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress
            // Отримуємо токени з сервісу
            const { accessToken, refreshToken, user } = await this.authService.login(
                username,
                password,
                ip,
            )
            // Встановлюємо Refresh Token у httpOnly куку
            res.cookie('refreshToken', refreshToken, {
                httpOnly: true, // Захищає від доступу через JavaScript (XSS)
                secure: process.env.NODE_ENV === 'production', // Тільки через HTTPS у продакшені
                sameSite: 'strict', // Захист від CSRF
                maxAge: 30 * 24 * 60 * 60 * 1000, // 30 днів
            })

            // Access Token та дані юзера повертаємо у JSON
            res.json({ accessToken, refreshToken, user })
        } catch (error) {
            next(error)
        }
    }

    /**
     * @swagger
     * /api/auth/refresh:
     *   post:
     *     summary: Оновлення Access токена через Refresh токен
     *     tags: [Auth]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             properties:
     *               refreshToken: { type: string }
     */
    async refresh(req, res, next) {
        try {
            // Гібридне отримання токена: пріоритет на body, потім куки
            const refreshToken = req.body.refreshToken || req.cookies?.refreshToken

            if (!refreshToken) {
                throw CustomError.Unauthorized('Refresh token не надано в body або cookies')
            }

            const { accessToken, refreshToken: newRefreshToken } =
                await this.authService.refreshTokens(refreshToken)

            // Якщо запит прийшов з куками, оновлюємо куку
            if (req.cookies?.refreshToken) {
                res.cookie('refreshToken', newRefreshToken, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'strict',
                    maxAge: 30 * 24 * 60 * 60 * 1000,
                })
            }

            // Повертаємо обидва токени в JSON (для мобільних застосунків)
            res.json({ accessToken, refreshToken: newRefreshToken })
        } catch (error) {
            next(error)
        }
    }

    /**
     * @swagger
     * /api/auth/change-password:
     *   post:
     *     summary: Зміна пароля користувача
     *     tags: [Auth]
     *     security: [{ bearerAuth: [] }]
     *     requestBody:
     *       content:
     *         application/json:
     *           schema:
     *             properties:
     *               oldPassword: { type: string }
     *               newPassword: { type: string }
     */
    async changePassword(req, res, next) {
        try {
            const { oldPassword, newPassword } = req.body
            const result = await this.authService.changePassword(
                req.user.sub,
                oldPassword,
                newPassword,
            )
            res.json(result)
        } catch (error) {
            next(error)
        }
    }

    /**
     * @swagger
     * /api/auth/validate:
     *   post:
     *     summary: Перевірка валідності токена (Introspection)
     *     tags: [Auth]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [token]
     *             properties:
     *               token: { type: string }
     *     responses:
     *       200:
     *         description: Результат валідації
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 valid: { type: boolean }
     *                 user: { type: object }
     */
    async validate(req, res, next) {
        try {
            const { token } = req.body
            const result = await this.authService.validateTokenExternal(token)

            // Навіть якщо токен невалідний, ми повертаємо 200 OK з полем valid: false
            // Це дозволяє клієнту обробити відповідь без catch-блоку
            res.json(result)
        } catch (error) {
            next(error)
        }
    }

    /**
     * @swagger
     * /api/auth/logout:
     *   post:
     *     summary: Вихід (анулювання сесії)
     *     tags: [Auth]
     *     security: [{ bearerAuth: [] }]
     */
    async logout(req, res, next) {
        try {
            // 1. Отримуємо токен з заголовка або з куки для анулювання в БД
            const token = req.headers.authorization?.split(' ')[1] || req.cookies?.refreshToken

            if (token) {
                // Анулюємо сесію в Oracle через сервіс
                await this.authService.logout(token)
            }

            const result = await this.authService.logout(token)

            // 2. Очищуємо куку на стороні клієнта
            res.clearCookie('refreshToken', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
            })

            // 3. Відправляємо успішну відповідь
            res.status(200).json({ result, message: 'Вихід успішний, куки очищено' })
        } catch (error) {
            next(error)
        }
    }
}

export default AuthController
