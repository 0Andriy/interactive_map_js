// src/main.js
import express from 'express'
import { createServer } from 'http'
import { initSocketServer } from './infrastructure/socket.server.js'
import { WSGateway } from './modules/ws/ws.gateway.js'
import { WSService } from './modules/ws/ws.service.js'

const bootstrap = async () => {
    const app = express()
    const httpServer = createServer(app)

    // 1. Ініціалізація Socket.io
    const io = initSocketServer(httpServer)

    // 2. Ініціалізація RabbitMQ (уявний клієнт)
    const rabbitMQ = {
        listen: (queue, cb) => {
            /* реалізація amqplib */
        },
    }

    // 3. Dependency Injection (Module layer)
    const wsService = new WSService(io, rabbitMQ)
    new WSGateway(io, wsService)

    // Починаємо слухати черги
    await wsService.listenToGlobalEvents()

    httpServer.listen(3003, () => {
        console.log('🚀 WS Service started on port 3003')
    })
}

bootstrap()
