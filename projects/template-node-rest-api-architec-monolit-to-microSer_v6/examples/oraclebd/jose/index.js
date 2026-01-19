import { JwtService } from './JwtService.js'
import { createOracleKeyResolver } from './resolvers/oracle.js'
import { withCache } from './resolvers/cache.js'

// 1. Отримуємо підключення до Oracle (через ваш пул)
const dbConn = await oraclePool.getConnection()

// 2. Створюємо Oracle ресолвер та додаємо до нього кеш
const resolver = withCache(createOracleKeyResolver(dbConn))

// 3. Інжектуємо ресолвер у JwtService
const jwtService = new JwtService({
    keyResolver: resolver,
    defaultOptions: {
        algorithm: 'RS256',
        issuer: 'my-corp-auth',
        clockSkewOffset: 15, // компенсація розсинхрону годинників
    },
})

// Тепер використання JwtService буде надшвидким завдяки кешу!
const token = await jwtService.sign({ user: 'senior' }, { kid: 'PROD_KEY_2026' })
