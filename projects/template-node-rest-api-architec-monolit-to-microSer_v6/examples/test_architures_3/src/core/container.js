import { config } from '../config/index.js'
import { JwtService } from './jwt/jwt.service.js'
import { OracleManager } from './database/oracle.service.js'
import { AuthService } from '../modules/auth/auth.service.js'
import { AuthManager } from '../modules/auth/auth.manager.js'

/**
 * Инициализация всех зависимостей системы
 */
export async function createContainer() {
    // 1. Инициализируем БД
    const dbManager = new OracleManager(config.db)
    await dbManager.initialize()

    // 2. Создаем универсальный Key Resolver, который знает о конфигах
    const keyResolver = async (typeId, header, operation) => {
        const tokenOpts = config.jwt.options[typeId]
        const { algorithm, keys } = tokenOpts
        const keySource = algorithm.startsWith('HS') ? keys.secret : keys

        return await JwtService.transformToJoseKey(keySource, algorithm, operation)
    }

    // 3. Создаем специализированные инстансы JWT (DI для JwtService)
    const accessJwt = new JwtService(
        config.jwt.types.ACCESS,
        config.jwt.options.access,
        keyResolver,
    )

    const refreshJwt = new JwtService(
        config.jwt.types.REFRESH,
        config.jwt.options.refresh,
        keyResolver,
    )

    // 4. Собираем AuthManager (Фасад)
    const authManager = new AuthManager(accessJwt, refreshJwt)

    // 5. Создаем бизнес-сервисы, внедряя в них менеджеры и БД
    const authService = new AuthService(authManager, dbManager)

    // Возвращаем все, что нужно контроллерам
    return {
        authService,
        authManager,
        dbManager,
    }
}
