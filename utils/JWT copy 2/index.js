import dotenv from 'dotenv'
dotenv.config()

import { JwtService } from './JwtService.js'
;(async () => {
    const jwtService = new JwtService()

    const payload = { userId: 42, role: 'admin' }

    // HS256 - access token (env секрет)
    const accessToken = await jwtService.sign(payload, 'access')
    console.log('Access Token:', accessToken)

    const decodedAccess = await jwtService.verify(accessToken, 'access')
    console.log('Decoded Access Token:', decodedAccess)

    // RS256 - refresh token (ключі з бази)
    const refreshToken = await jwtService.sign(payload, 'refresh')
    console.log('Refresh Token:', refreshToken)

    const decodedRefresh = await jwtService.verify(refreshToken, 'refresh')
    console.log('Decoded Refresh Token:', decodedRefresh)
})()
