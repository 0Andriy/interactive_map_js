// src/main.js
import express from 'express'
import { EventBus } from './common/event-bus.js'
import { UserProxyModule } from './modules/user-proxy/user-proxy.module.js'
import { AuthModule } from './modules/auth/auth.module.js'

const app = express()
const dbClient = {} // Ваше підключення до БД

// 1. Глобальні сервіси
const eventBus = new EventBus()

// 2. Ініціалізуємо модуль-донор (UserProxy)
const { userClient } = UserProxyModule.register()

// 3. Ініціалізуємо споживач (Auth), передаючи йому провайдери
const { authRouter } = AuthModule.register({
    userClient,
    eventBus,
    dbClient,
})

app.use('/auth', authRouter)
app.listen(3000)

//
// src/main.js

// 1. Ініціалізуємо модуль Users повністю
const usersRepository = new UsersRepository(db)
const usersService = new UsersService(usersRepository)

// 2. Ініціалізуємо модуль Auth, передаючи йому UsersService як провайдер
const authModule = AuthModule.register({
    // Замість HTTP-клієнта передаємо готовий сервіс
    userSource: usersService,
    eventBus,
    dbClient: db,
})

app.use('/auth', authModule.authRouter)
