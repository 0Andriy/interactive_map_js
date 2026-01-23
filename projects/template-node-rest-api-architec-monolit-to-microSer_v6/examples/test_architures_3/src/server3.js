import express from 'express'
import { EventBus } from './src/common/event-bus.js'
import { UsersModule } from './src/modules/users/users.module.js'
import { AuthModule } from './src/modules/auth/auth.module.js'

const app = express()
app.use(express.json())

// --- КРОК 1: Глобальні інфраструктурні об'єкти ---
const dbClient = {} // Ваше підключення до бази (напр. Prisma, Knex)
const eventBus = new EventBus()

// --- КРОК 2: Ініціалізація модуля-джерела (Users) ---
// Цей модуль не залежить від Auth, тому створюється першим
const usersModule = UsersModule.register({
    dbClient,
    eventBus,
})

// --- КРОК 3: Ініціалізація залежного модуля (Auth) ---
// Ми передаємо йому usersService ЯК ПРОВАЙДЕР даних користувача
const authModule = AuthModule.register({
    userSource: usersModule.usersService, // Прямий DI сервісу для моноліту
    eventBus,
    dbClient,
})

// --- КРОК 4: Підключення роутів до Express ---
app.use('/api/users', usersModule.usersRouter)
app.use('/api/auth', authModule.authRouter)

app.listen(3000, () => {
    console.log('2026 Server running on port 3000')
})
