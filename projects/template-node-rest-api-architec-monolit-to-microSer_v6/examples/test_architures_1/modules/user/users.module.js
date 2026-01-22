// index.js
import { UsersRepository } from './users.repository.js'
import { UsersService } from './users.service.js'
import { UsersController } from './users.controller.js'
import { createUsersRouter } from './users.routes.js'

/**
 * Фабрика для ініціалізації модуля Users
 */
export function createUsersModule(dbManager, messageBroker) {
    // 1. Впроваджуємо базу в репозиторій
    const userRepository = new UsersRepository(dbManager)

    // 2. Впроваджуємо репозиторій у сервіс
    const userService = new UsersService(userRepository, messageBroker)

    // 3. Впроваджуємо сервіс у контролер
    const userController = new UsersController(userService)

    // 4. Створюємо роутер, передаючи йому готовий контролер
    const usersRouter = createUsersRouter(userController)

    // Повертаємо зібраний роутер
    return { router: usersRouter, service: userService }
}
