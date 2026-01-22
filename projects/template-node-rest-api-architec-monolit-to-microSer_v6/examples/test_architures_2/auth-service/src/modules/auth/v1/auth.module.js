// src/modules/auth/auth.module.js
import { AuthService } from './auth.service.js'
import { AuthController } from './auth.controller.js'
import { authRouter } from './auth.routes.js'
import { Database } from '../../../infrastructure/database.js'
import { UserClient } from '../../../infrastructure/user.client.js'

export const initAuthModule = (config, tokenService, eventBus) => {
    // Інфраструктура
    const db = new Database(config.oracle)
    const userClient = new UserClient(config.userServiceUrl)

    // Логіка
    const service = new AuthService(userClient, tokenService, db, eventBus)
    const controller = new AuthController(service)

    // Повертаємо роути, куди інжектуємо контролер та потрібні сервіси для мідлвайрів
    return authRouter(controller, tokenService)
}
