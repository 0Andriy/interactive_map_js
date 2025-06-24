// src/routes/v1/index.js
import { Router } from 'express'
import basicRoutes from './basic/basic.route.js'
// import authRoutes from './auth/auth.route.js'
// import userRoutes from './user/user.route.js' // Припускаємо, що у вас є цей файл

const router = Router()

router.use('/', basicRoutes)
// router.use('/auth', authRoutes)
// router.use('/users', userRoutes) // Приклад підключення інших маршрутів

export default router
