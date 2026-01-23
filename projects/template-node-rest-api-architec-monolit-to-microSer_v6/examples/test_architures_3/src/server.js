import express from 'express'
import { createContainer } from './core/container.js'
import { createAuthRouter } from './modules/auth/auth.controller.js'

async function start() {
    const app = express()

    // Инициализируем все зависимости
    const container = await createContainer()

    // Передаем зависимости в контроллеры (Dependency Injection)
    app.use('/auth', createAuthRouter(container.authService))

    app.listen(3000, () => console.log('2026 Ready Server on port 3000'))
}

start().catch(console.error)
