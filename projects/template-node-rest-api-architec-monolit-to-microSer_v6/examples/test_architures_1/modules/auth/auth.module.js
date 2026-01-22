import { AuthService } from './auth.service.js'
import { AuthController } from './auth.controller.js'
import { createAuthRouter } from './auth.routes.js'

export function createAuthModule(dbManager, usersService, tokenService) {
    const authRepo = new AuthRepository(dbManager)
    const authService = new AuthService(usersService, tokenService, authRepo)
    const authController = new AuthController(authService)
    const router = createAuthRouter(authController)

    // Middleware для захисту роутів (Guard)
    const authGuard = async (req, res, next) => {
        try {
            const token = req.headers.authorization?.split(' ')[1]
            const dbAlias = req.headers['x-db-alias'] || 'CORE_UA'
            const decoded = await tokenService.verify(token)
            if (!(await authRepo.isSessionValid(dbAlias, token))) throw new Error()

            req.user = decoded
            next()
        } catch (e) {
            res.status(401).json({ error: 'Unauthorized' })
        }
    }

    return { router, authGuard, service: authService }
}
