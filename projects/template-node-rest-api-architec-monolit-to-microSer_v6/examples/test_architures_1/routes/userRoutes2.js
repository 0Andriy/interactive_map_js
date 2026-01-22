import { Router } from 'express'
import { UserRepository } from '../../../repositories/UserRepository.js'
import { UserService } from '../../../services/UserService.js'
import { UserControllerV1 } from './UserController.js'

export function createUserModuleV1(dbManager) {
    const router = Router()

    // 1. Ініціалізуємо сервіс (він може бути спільним для всіх баз)
    const userService = new UserService()

    // 2. Middleware для динамічного вибору бази
    router.use((req, res, next) => {
        const dbAlias = req.query.db || 'CORE' // Логіка вибору аліасу
        try {
            const dbService = dbManager.db(dbAlias)

            // Створюємо репозиторій саме для цієї бази і прокидаємо в req
            req.userRepo = new UserRepository(dbService)
            next()
        } catch (err) {
            res.status(400).json({ error: err.message })
        }
    })

    // 3. Ініціалізуємо контролер
    const controller = new UserControllerV1(userService)

    // 4. Визначаємо маршрути
    router.get('/:id', controller.getUser)

    return router
}
