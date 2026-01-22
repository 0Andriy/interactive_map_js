// src/modules/auth/auth.routes.js
import { Router } from 'express'
import { authGuard } from '../../../common/middlewares/auth.guard.js'

export const authRouter = (controller, tokenService) => {
    const router = Router()

    // Публічний роут
    router.post('/login', (req, res) => controller.login(req, res))

    // Захищений роут (наприклад, logout або check)
    router.post('/logout', authGuard(tokenService), (req, res) => controller.logout(req, res))

    return router
}
