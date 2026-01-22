// src/modules/user/user.routes.js
import { Router } from 'express'
import { authGuard } from '../../common/middlewares/auth.guard.js'

export const userRouter = (controller) => {
    const router = Router()

    // Только админ может видеть список всех пользователей
    router.get('/', authGuard, rolesGuard(['admin']), (req, res) => controller.getAll(req, res))

    // 1. Внутрішній роут (для auth-service), зазвичай закритий на рівні мережі
    router.get('/internal/by-email', (req, res) => controller.getInternalUserByEmail(req, res))

    // 2. Публічний роут (наприклад, реєстрація)
    router.post('/register', (req, res) => controller.register(req, res))

    // 3. ЗАХИЩЕНІ роути (тільки для авторизованих користувачів)
    // Отримати власний профіль
    router.get('/me', authGuard, rolesGuard(['user', 'admin']), (req, res) =>
        controller.getMe(req, res),
    )

    // Оновити профіль
    router.patch('/me', authGuard, (req, res) => controller.updateMe(req, res))

    // Адмінський роут (приклад)
    router.get('/:id', authGuard, (req, res) => controller.getById(req, res))

    return router
}
