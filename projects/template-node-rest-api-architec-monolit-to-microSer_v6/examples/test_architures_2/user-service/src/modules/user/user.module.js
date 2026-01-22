// src/modules/user/user.module.js
import { UserService } from './user.service.js'
import { UserController } from './user.controller.js'
import { userRouter } from './user.routes.js'
import { Database } from '../../infrastructure/database.js'

export const initUserModule = (config) => {
    const db = new Database(config.oracle)
    const service = new UserService(db)
    const controller = new UserController(service)

    return userRouter(controller)
}

// src/modules/user/user.module.js
import { UserRepository } from './user.repository.js'
import { UserService } from './user.service.js'
import { UserController } from './user.controller.js'
import { Database } from '../../infrastructure/database.js'

export const initUserModule = (config) => {
    const db = new Database(config.oracle)

    // Ланцюжок залежностей: DB -> Repository -> Service -> Controller
    const repository = new UserRepository(db)
    const service = new UserService(repository)
    const controller = new UserController(service)

    return userRouter(controller)
}
