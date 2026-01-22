// src/main.js
import { OracleDatabaseManager } from './infrastructure/OracleDatabaseManager.js'
import { UserRepository } from './repositories/UserRepository.js'
import { UserService } from './services/UserService.js'

async function initUserModule() {
    const dbManager = new OracleDatabaseManager(console)

    // Реєструємо Oracle
    await dbManager.register('MAIN_DB', {
        /* config */
    })

    // Отримуємо сервіс бази
    const mainDb = dbManager.db('MAIN_DB')

    // Створюємо репозиторій (тут можна легко підставити інший клас репозиторію)
    const userRepo = new UserRepository(mainDb)

    // Ініціалізуємо сервіс
    const userService = new UserService(userRepo)

    return userService
}

const userModule = await initUserModule()
const user = await userModule.findUser(123)
