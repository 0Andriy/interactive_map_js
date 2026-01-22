import express from 'express'
import { createUsersModule } from './modules/users/index.js'
import { createAuthModule } from './modules/auth/index.js'
import { TokenService } from './shared/TokenService.js'

export function createApp(dbManager, messageBroker) {
    const app = express()
    app.use(express.json())

    // 1. Спільні інфраструктурні сервіси
    const tokenService = new TokenService(process.env.JWT_SECRET || 'secret')

    // 2. Ініціалізація модуля Users
    const usersModule = createUsersModule(dbManager, messageBroker)

    // 3. Ініціалізація модуля Auth (залежить від UsersService)
    const authModule = createAuthModule(usersModule.service, tokenService)

    // 4. Підключення маршрутів
    app.use('/auth', authModule.router)

    // Приклад захищеного маршруту: передаємо Guard з модуля Auth
    app.use('/api/users', authModule.authGuard, usersModule.router)

    return app
}
