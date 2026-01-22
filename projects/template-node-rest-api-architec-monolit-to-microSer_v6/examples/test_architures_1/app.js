// src/app.js
import express from 'express'
import { OracleDatabaseManager } from './infrastructure/OracleDatabaseManager.js'
import { UserRepository } from './repositories/UserRepository.js'
import { UserService } from './services/UserService.js'
import { UserController } from './controllers/UserController.js'
import { v1Router } from './routes/userRoutes.js'

const app = express()
app.use(express.json())

// 1. Налаштування бази
const dbManager = new OracleDatabaseManager(console);
await dbManager.register('MAIN', { user: 'hr', password: 'hr', connectString: 'localhost/xe' });

// Збираємо User модуль
const userRepo = new UserRepository(dbManager.db('CORE'))
const userService = new UserService(userRepo)
const userController = new UserController(userService)
const userRouter = createUserRouter(userController)


// 3. Підключення версіонованих маршрутів
app.use('/api/v1', v1Router(userService));

// Глобальний обробник помилок
app.use((err, req, res, next) => {
    res.status(500).json({ error: err.message })
})

app.listen(3000, () => console.log('Server started on port 3000'))
