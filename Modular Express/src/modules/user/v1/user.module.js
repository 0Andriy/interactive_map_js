import { createUserRouter } from './user.routes.js'
import { UserController } from './user.controller.js'
import { UserService } from './user.service.js'
import { UserRepository } from './user.repository.js'

export function initUserModule({ dbManager, logger, authMiddleware, rolesMiddleware }) {
    // Створюємо інстанси один раз (Singletons)
    // Вручну передаємо залежності (DI)
    const repository = new UserRepository(dbManager)
    const service = new UserService(repository, logger)
    const controller = new UserController(service)

    // Ініціалізуємо роутер
    const router = createUserRouter(controller, authMiddleware, rolesMiddleware)

    return { service, controller, router }
}
