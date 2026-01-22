import express from 'express'
import { config } from './config/index.js'
import { TokenService } from './infrastructure/token.service.js'
import { initAuthModule } from './modules/auth/v1/auth.module.js'
import { getPublicKeyJWK } from './infrastructure/keys.js'

const bootstrap = async () => {
    const app = express()
    app.use(express.json())

    // Спільні провайдери
    const tokenService = new TokenService(config.jwt)
    const eventBus = { emit: (event, data) => console.log(`RabbitMQ: ${event}`, data) }

    app.get('/.well-known/jwks.json', async (req, res) => {
        const jwks = await getPublicKeyJWK()
        res.json(jwks)
    })

    // Ініціалізація модуля
    const authRouter = initAuthModule(config, tokenService, eventBus)
    app.use('/auth', authRouter)

    app.listen(config.port, () => {
        console.log(`[2026] Auth Service on port ${config.port}`)
    })
}

bootstrap()
