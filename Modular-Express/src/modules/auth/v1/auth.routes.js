// auth.routes.js
import { Router } from 'express'
import validate from '../middlewares/validation.middleware.js'
import AuthMiddleware from './auth.middleware.js'
import {
    TokenValidateSchema,
    LoginSchema,
    RegisterSchema,
    RefreshSchema,
    ChangePasswordSchema,
} from './auth.validation.js'

/**
 * Клас маршрутів модуля Auth.
 */
class AuthRoutes {
    /**
     * @param {AuthController} controller - DI контролер
     * @param {AuthMiddleware} middleware - DI мідлвар для захисту роутів
     */
    constructor(controller, middleware) {
        this.controller = controller
        this.middleware = middleware
        this.router = Router()
        this.initRoutes()
    }

    initRoutes() {
        // --- Публічні інфраструктурні маршрути ---

        /**
         * Ендпоінт для інтроспекції токена.
         * Дозволяє перевірити, чи є токен валідним та чи не був він відкликаний у базі Oracle.
         */
        this.router.post(
            '/validate',
            validate(TokenValidateSchema, 'body'),
            this.controller.validate.bind(this.controller),
        )

        /**
         * Стандартний ендпоінт для отримання публічних ключів.
         * Використовується бібліотеками типу jwks-rsa для автоматичної перевірки.
         */
        this.router.get('/.well-known/jwks.json', this.controller.getJwks.bind(this.controller))

        // Публічний ключ для зовнішніх споживачів
        this.router.get('/public-key', this.controller.getPublicKey.bind(this.controller))

        // --- Публічні маршрути ---

        // Вхід та реєстрація
        this.router.post(
            '/login',
            validate(LoginSchema),
            this.controller.login.bind(this.controller),
        )

        this.router.post(
            '/register',
            validate(RegisterSchema),
            this.controller.register.bind(this.controller),
        )

        // Оновлення токенів (Refresh не потребує Bearer, він несе токен у тілі)
        this.router.post(
            '/refresh',
            validate(RefreshSchema),
            this.controller.refresh.bind(this.controller),
        )

        // --- Захищені маршрути (вимагають JWT) ---

        // Вихід
        this.router.post(
            '/logout',
            this.middleware.verifyToken.bind(this.middleware),
            this.controller.logout.bind(this.controller),
        )

        // Зміна пароля
        this.router.post(
            '/change-password',
            this.middleware.verifyToken.bind(this.middleware),
            validate(ChangePasswordSchema),
            this.controller.changePassword.bind(this.controller),
        )

        // Дані поточної сесії
        this.router.get(
            '/me',
            this.middleware.verifyToken.bind(this.middleware),
            this.controller.getMe.bind(this.controller),
        )
    }

    /**
     * Повертає налаштований роутер
     */
    getRouter() {
        return this.router
    }
}

export default AuthRoutes
