import { RoleRepository } from './role.repository.js'
import { RoleService } from './role.service.js'
import { RoleController } from './role.controller.js'
import { RoleRoutes } from './role.routes.js'

/**
 * Модуль Role (Composition Root).
 * Відповідає за Dependency Injection та ініціалізацію всього модуля.
 * Забезпечує інкапсуляцію логіки та експорт сервісів для інших модулів.
 */
export class RoleModule {
    /**
     * Метод для збірки модуля - Ініціалізація модуля.
     * @param {Object} db - Пул з'єднань Oracle (oracledb connection)
     * @returns {Object} Об'єкт з роутером для Express та сервісом для DI.
     */
    static init(db) {
        // 1. Ініціалізація Repository (Infrastructure Layer)
        const repository = new RoleRepository(db)

        // 2. Ініціалізація Service (Domain/Business Layer)
        // Передаємо репозиторій як залежність
        const service = new RoleService(repository)

        // 3. Ініціалізація Controller (Presentation Layer)
        // Передаємо сервіс як залежність
        const controller = new RoleController(service)

        // 4. Отримання налаштований Express Router
        // const router = roleRoutes(controller)
        const routes = new RoleRoutes(controller)

        // 3. Експортуємо інтерфейси
        return {
            router: routes.getRouter(), // Для підключення в app.use()
            service, // Для передачі в UserModule (наприклад, для перевірки ролі при створенні юзера)
            repository, // Може знадобитися для складних join-запитів
        }
    }
}
