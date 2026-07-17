import { AuthRepository } from './auth.repository.js'
import { TokenService } from './token.service.js'
import { AuthService } from './auth.service.js'
import { AuthController } from './auth.controller.js'
import { AuthRouter } from './auth.router.js'
import { AuthGuard } from './auth.middleware.js'

export class AuthModule {
    /**
     * @param {Object} dbManager - Глобальний менеджер підключень до Oracle
     * @param {Object} jwtManager - Глобальний менеджер стратегій токенів (use('access') / use('refresh'))
     * @param {Object} sessionRepository - Експортований репозиторій з SessionModule
     * @param {Object} userRepository - Експортований репозиторій з UserModule
     */
    constructor({ dbManager, jwtManager, sessionRepository, userRepository }) {
        // 0. Створюємо власний системний репозиторій для PL/SQL викликів
        this.authRepository = new AuthRepository(dbManager)

        // 1. Ініціалізуємо внутрішній TokenService
        this.tokenService = new TokenService(jwtManager)

        // 2. Впроваджуємо залежності у бізнес-сервіс (локальні + зовнішні з інших модулів)
        this.service = new AuthService(
            this.authRepository, // Для виклику PL/SQL пакетів авторизації СУБД
            sessionRepository, // Для керування сесіями в REFRESH_TOKENS
            userRepository, // Для керування профілями та брутфорсом в USERS
            this.tokenService, // Для підпису та валідації JWT токенів
        )

        // 3. Збираємо HTTP шар модуля
        this.controller = new AuthController(this.service)

        // 4. Створюємо екземпляр AuthGuard (Middleware) для використання всередині модуля та ззовні
        this.guard = new AuthGuard(
            this.tokenService,
            sessionRepository,
            userRepository,
            this.service,
            this.controller,
        )

        // Передаємо в роутер метод нашого гварду (наприклад, для інтроспекції сторонніх сервісів)
        // Передати весь гвард, якщо роутеру потрібні різні методи
        this.router = new AuthRouter(this.controller, this.guard)
    }

    /**
     * Експортуємо інтерфейс модуля.
     * Віддаємо роутер для Express, локальні сервіси, а також гвард (Guard),
     * щоб інші модулі додатку могли захищати свої сторінки чи API ендпоінти.
     */
    exports() {
        return {
            repository: this.authRepository,
            service: this.service,
            guard: this.guard, // Експортуємо гвард для захисту інших роутів у системі
            router: this.router.getRouter(),
        }
    }
}
