import { Router } from 'express'

export function createUsersRouter(usersController) {
    const router = Router()

    // Прив'язуємо методи контролера до маршрутів
    router.post('/register', usersController.signUp)
    router.get('/me', usersController.getMe)
    router.get('/:email', usersController.getProfileByEmail)

    return router
}
