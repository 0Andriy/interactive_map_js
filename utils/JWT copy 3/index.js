import dotenv from 'dotenv'
dotenv.config()

import { JwtService } from './JwtService.js'

;(async () => {
    const jwtService = new JwtService()

    const payload = { userId: 1001, role: 'user' }

    // Генерація та перевірка access токена (HS256 з env)
    const accessToken = await jwtService.sign(payload, 'access')
    console.log('Access Token:', accessToken)

    const decodedAccess = await jwtService.verify(accessToken, 'access')
    console.log('Decoded Access Token:', decodedAccess)

    // Генерація та перевірка refresh токена (RS256 з файлів)
    const refreshToken = await jwtService.sign(payload, 'refresh')
    console.log('Refresh Token:', refreshToken)

    const decodedRefresh = await jwtService.verify(refreshToken, 'refresh')
    console.log('Decoded Refresh Token:', decodedRefresh)

    // Примусове оновлення ключів (наприклад, після зміни файлів)
    await jwtService.refreshSecrets('refresh')
    console.log('Refresh token keys updated')
})()
