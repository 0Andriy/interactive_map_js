// src/modules/auth/auth.router.js
import { Router } from 'express'

export function createAuthRouter(authController) {
    const router = Router()
    router.post('/login', authController.handleLogin)
    return router
}
