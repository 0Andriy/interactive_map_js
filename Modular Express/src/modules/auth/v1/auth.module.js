// auth.module.js
import AuthRepository from './auth.repository.js'
import AuthService from './auth.service.js'
import AuthController from './auth.controller.js'
import AuthRoutes from './auth.routes.js'
import AuthMiddleware from './auth.middleware.js'
import TokenService from './auth.token.js'

/**
 * Модуль Auth (Composition Root).
 * Збирає докупи логіку безпеки, сесій та JWT.
 */
class AuthModule {
    /**
     * Статичний метод для асинхронної ініціалізації модуля.
     * @param {Object} db - Oracle Connection.
     * @param {UserService} userService - Сервіс з UserModule.
     */
    static async init(db, userService) {
        // 1. Ініціалізуємо криптографію (jose)
        const tokenService = new TokenService()
        await tokenService.init() // Чекаємо на завантаження ключів RS256

        // 2. Створюємо інфраструктурний та бізнес шари
        const repository = new AuthRepository(db)
        // // Автоматичне створення таблиці сесій
        // await repository.initializeSchema()

        const service = new AuthService(userService, tokenService, repository)

        // 3. Налаштовуємо middleware та презентаційний шар
        const middleware = new AuthMiddleware(tokenService)
        const controller = new AuthController(service)

        // 4. Ініціалізуємо клас маршрутів
        const routes = new AuthRoutes(controller, middleware)

        return {
            router: routes.getRouter(),
            service: service,
            middleware: middleware, // Експортуємо для захисту інших модулів (Role, User)
        }
    }
}

export default AuthModule
