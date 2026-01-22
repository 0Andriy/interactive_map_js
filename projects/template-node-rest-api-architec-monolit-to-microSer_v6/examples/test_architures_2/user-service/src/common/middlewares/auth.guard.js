// src/common/middlewares/auth.guard.js
import * as jose from 'jose'
import { config } from '../../config/index.js'

export const authGuard = async (req, res, next) => {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Unauthorized: Missing Token' })
    }

    const token = authHeader.split(' ')[1]
    try {
        const secret = new TextEncoder().encode(config.jwt.accessSecret)
        const { payload } = await jose.jwtVerify(token, secret)

        // Додаємо дані з токену (наприклад userId) в об'єкт запиту
        req.user = payload
        next()
    } catch (err) {
        return res.status(401).json({ message: 'Unauthorized: Invalid Token' })
    }
}
