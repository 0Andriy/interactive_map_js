// auth.middleware.js
import CustomError from '../utils/CustomError.js'

/**
 * Middleware для захисту маршрутів.
 * Перевіряє наявність та валідність JWT у заголовку Authorization.
 */
class AuthMiddleware {
    /**
     * @param {TokenService} tokenService - Вже ініціалізований сервіс (з jose)
     */
    constructor(tokenService) {
        this.tokenService = tokenService
    }

    /**
     * Основний метод перевірки токена (Bearer Strategy)
     */
    async verifyToken(req, res, next) {
        try {
            const authHeader = req.headers.authorization

            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                throw CustomError.Unauthorized(
                    'Токен авторизації відсутній або має невірний формат',
                )
            }

            const token = authHeader.split(' ')[1]

            // Використовуємо jose через наш TokenService
            const payload = await this.tokenService.verifyToken(token)

            /**
             * Зберігаємо payload у об'єкті запиту.
             * Зазвичай містить: { sub (id), username, roles }
             */
            req.user = payload

            next()
        } catch (error) {
            // Якщо jose викинув помилку про термін дії або підпис
            next(CustomError.Unauthorized(error.message || 'Помилка автентифікації'))
        }
    }

    /**
     * Додатковий метод для перевірки конкретних ролей (RBAC)
     * @param {string[]} allowedRoles - Масив дозволених ролей
     */
    checkRole(allowedRoles) {
        return (req, res, next) => {
            if (!req.user || !req.user.roles) {
                return next(CustomError.Forbidden('Доступ заборонено: відсутні дані про ролі'))
            }

            const hasRole = req.user.roles.some((role) => allowedRoles.includes(role))

            if (!hasRole) {
                return next(
                    CustomError.Forbidden('У вас недостатньо прав для виконання цієї операції'),
                )
            }

            next()
        }
    }
}

export default AuthMiddleware
