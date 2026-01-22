// src/main.js
import express from 'express'
import { config } from './config/index.js'
import { initUserModule } from './modules/user/user.module.js'

const bootstrap = async () => {
    const app = express()
    app.use(express.json())

    const API_VERSION = 'v1'

    // Ініціалізація модуля
    const userModuleRouter = initUserModule(config)

    // Монтування з версією
    app.use(`/api/${API_VERSION}/users`, userModuleRouter)

    app.listen(config.port, () => {
        console.log(`🚀 User Service [${API_VERSION}] started on port ${config.port}`)
    })
}

bootstrap().catch(console.error)
