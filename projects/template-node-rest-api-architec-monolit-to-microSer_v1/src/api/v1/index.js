// src/api/v1/index.js
import { Router } from 'express'
import basicRoutes from './routes/basic.router.js'
import authRoutes from './routes/auth.router.js'
// import userRoutes from './routes/user.router.js'

const router = Router()

router.use('/', basicRoutes)
router.use('/auth', authRoutes)
// router.use('/users', userRoutes)

export default router
