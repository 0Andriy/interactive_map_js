// src/modules/auth/auth.module.js
import { AuthService } from './auth.service.js'
import { AuthController } from './auth.ctrl.js'
import { AuthRepository } from './auth.repo.js'
import { createAuthRouter } from './auth.router.js'

export class AuthModule {
    // Передаем зависимости "снаружи" (из других модулей)
    static register({ userClient, eventBus }) {
        const authRepository = new AuthRepository()
        const authService = new AuthService(userClient, authRepository, eventBus)
        const authController = new AuthController(authService)
        const authRouter = createAuthRouter(authController)

        return { authRouter, authService }
    }
}

// src/modules/auth/auth.module.js
import { AuthRepository } from './auth.repository.js'
import { AuthService } from './auth.service.js'
import { AuthController } from './auth.ctrl.js'
import { createAuthRouter } from './auth.router.js'

export class AuthModule {
    // Приймаємо зовнішні залежності через аргумент (аналог imports в NestJS)
    static register({ userClient, eventBus, dbClient }) {
        const repository = new AuthRepository(dbClient)
        const service = new AuthService(userClient, repository, eventBus)
        const controller = new AuthController(service)
        const router = createAuthRouter(controller)

        return {
            authRouter: router,
            authService: service, // Експортуємо, якщо комусь знадобиться
        }
    }
}

// src/modules/auth/auth.module.js
import { UserProvider } from './providers/user.provider.js'
import { AuthRepository } from './auth.repository.js'
import { AuthService } from './auth.service.js'
import { UserUpdatedSubscriber } from './subscribers/user-updated.consumer.js'

export class AuthModule {
    static register({ httpClient, dbClient, eventBus }) {
        // 1. Створюємо "внутрішні" залежності модуля
        const userProvider = new UserProvider(httpClient)
        const authRepository = new AuthRepository(dbClient)

        // 2. Створюємо сервіс, прокидаючи в нього провайдери
        const authService = new AuthService(userProvider, authRepository, eventBus)

        // 3. Ініціалізуємо підписників
        new UserUpdatedSubscriber(eventBus, authService)

        // 4. Повертаємо контролер/роутер (публічне API модуля)
        return {
            authService,
            authRouter: createAuthRouter(new AuthController(authService)),
        }
    }
}

// -----------------------------------------------

// src/modules/users/users.service.js
export class UsersService {
    constructor(usersRepository) {
        this.usersRepository = usersRepository
    }

    async findById(id) {
        // Прямий запит до БД (поки ми в моноліті)
        return this.usersRepository.getById(id)
    }
}

// src/modules/auth/providers/user.provider.js
export class UserProvider {
    constructor(usersService) {
        // В моноліті сюди прийде екземпляр UsersService
        // В мікросервісах сюди прийде HttpClient
        this.usersService = usersService
    }

    async getUserForAuth(id) {
        // Адаптуємо дані з модуля Users під потреби Auth
        const user = await this.usersService.findById(id)

        return {
            id: user.uuid,
            email: user.email,
            roles: user.roles,
        }
    }
}
