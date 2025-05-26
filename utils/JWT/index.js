import JwtService from './JwtService.js'
import { tokenConfigs } from './jwtConfig.js'

const dbConfig = {
    uri: process.env.MONGO_URI || 'mongodb://localhost:27017',
    dbName: 'myapp',
    options: {},
}

;(async () => {
    const jwtService = new JwtService(tokenConfigs, dbConfig)

    // Дочекаємось 1 с щоб підключення до Mongo відбулось
    await new Promise((r) => setTimeout(r, 1000))

    const accessToken = await jwtService.sign({ userId: 123 }, 'access')
    console.log('Access token:', accessToken)

    const refreshToken = await jwtService.sign({ userId: 123 }, 'refresh')
    console.log('Refresh token:', refreshToken)

    const decodedAccess = await jwtService.verify(accessToken, 'access')
    console.log('Decoded access token:', decodedAccess)

    // Очищення кешу, якщо потрібно
    jwtService.clearCache()
})()
