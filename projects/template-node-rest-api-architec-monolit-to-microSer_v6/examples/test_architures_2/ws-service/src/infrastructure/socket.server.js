// src/infrastructure/socket.server.js
import { Server } from 'socket.io'
import { verifyToken } from './token-verifier.js'

export const initSocketServer = (httpServer) => {
    const io = new Server(httpServer, {
        cors: { origin: '*' },
    })

    // Мідлвайр автентифікації (аналог AuthGuard)
    io.use(async (socket, next) => {
        const token = socket.handshake.auth.token
        try {
            const payload = await verifyToken(token)
            socket.user = payload // sub = userId
            next()
        } catch (err) {
            next(new Error('Unauthorized'))
        }
    })

    return io
}
