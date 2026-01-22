import { Router } from 'express'

export function createAuthRouter(authController) {
    const router = Router()
    router.post('/login', authController.login)
    return router
}
