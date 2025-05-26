import dotenv from 'dotenv'
dotenv.config()

import { JwtService } from './JwtService.js'

;(async () => {
    const jwtService = new JwtService()

    const payload = { userId: 123, role: 'user' }

    // Підписати access токен (HS256, синхронний)
    const accessToken = await jwtService.sign(payload, 'access')
    console.log('Access Token:', accessToken)

    // Верифікувати access токен
    const decodedAccess = await jwtService.verify(accessToken, 'access')
    console.log('Decoded Access Token:', decodedAccess)

    // Підписати refresh токен (RS256, асинхронний)
    const refreshToken = await jwtService.sign(payload, 'refresh')
    console.log('Refresh Token:', refreshToken)

    // Верифікувати refresh токен
    const decodedRefresh = await jwtService.verify(refreshToken, 'refresh')
    console.log('Decoded Refresh Token:', decodedRefresh)

    // Підписати emailVerification токен (HS512, синхронний)
    const emailToken = await jwtService.sign(payload, 'emailVerification')
    console.log('Email Verification Token:', emailToken)

    const decodedEmail = await jwtService.verify(emailToken, 'emailVerification')
    console.log('Decoded Email Verification Token:', decodedEmail)
})()
