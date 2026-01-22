// src/routes/userRoutes.js
import { Router } from 'express'

export function v1Router(userController) {
    const router = Router()

    // Описуємо маршрути та прив'язуємо їх до методів контролера
    router.get('/:id', userController.getUser)
    router.post('/', userController.register)
    router.get('/', userController.list) // наприклад, для всіх користувачів

    return router
}
