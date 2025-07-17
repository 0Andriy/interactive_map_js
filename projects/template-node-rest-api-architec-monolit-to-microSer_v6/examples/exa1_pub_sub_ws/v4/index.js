// index.js

import WebSocketApplication from './Application.js'
import { createLogger } from './logger.js'
import http from 'http'

const appLogger = createLogger('MainApp')

// Приклад дефолтної поведінки для чат-Namespace
// Тепер 'namespace' передається явно в контексті події
const chatDefaultHandler = (context) => {
    const { type, payload, client, namespace } = context // <-- ЗМІНА ТУТ
    appLogger.debug(`[ChatNamespace-Default] Event type: ${type}`)

    if (type === 'CHAT_MESSAGE') {
        const roomName = payload.room || 'general'
        const room = namespace.getOrCreateRoom(roomName) // <-- ВИКОРИСТОВУЄМО ЯВНО ПЕРЕДАНИЙ NAMESPACE
        const message = {
            type: 'CHAT_MESSAGE',
            user: client.userId || client.connectionId,
            text: payload.text,
            timestamp: new Date().toISOString(),
        }
        room.send(message, [], { binary: false })
        client.send({ type: 'ACK', originalType: 'CHAT_MESSAGE' })
    } else if (type === 'JOIN_ROOM') {
        const roomName = payload.room
        if (roomName) {
            const room = namespace.getOrCreateRoom(roomName) // <-- ВИКОРИСТОВУЄМО ЯВНО ПЕРЕДАНИЙ NAMESPACE
            room.addClient(client)
            client.send({ type: 'ROOM_JOINED', room: roomName })
            room.send(
                {
                    type: 'SYSTEM_MESSAGE',
                    text: `${client.userId || client.connectionId} joined ${roomName}`,
                },
                [client.connectionId],
            )
        } else {
            client.send({ type: 'ERROR', payload: 'Room name required to join.' })
        }
    }
}

// Приклад кастомної поведінки для чат-Namespace (доповнює дефолтну)
const chatCustomHandler = (context) => {
    const { type, defaultHandlerResult, client, namespace } = context // <-- ЗМІНА ТУТ
    appLogger.debug(
        `[ChatNamespace-Custom] Event type: ${type}. Default result: ${defaultHandlerResult}`,
    )

    if (type === 'CHAT_MESSAGE' && client.userId === 'admin') {
        appLogger.info(`Admin ${client.userId} sent a message.`)
    }
}

const namespaceConfigs = new Map()

namespaceConfigs.set('chat', {
    defaultHandler: chatDefaultHandler,
    customHandler: chatCustomHandler,
    autoCleanupEmptyRoom: true,
    emptyRoomLifetimeMs: 5 * 60 * 1000,
})

namespaceConfigs.set('game', {
    // Тепер 'namespace' передається явно в контексті події
    defaultHandler: (context) => {
        const { type, payload, client, namespace } = context // <-- ЗМІНА ТУТ
        appLogger.debug(`[GameNamespace-Default] Event type: ${type}`)
        if (type === 'PLAYER_MOVE') {
            const roomName = payload.gameId
            const room = namespace.getRoom(roomName) // <-- ВИКОРИСТОВУЄМО ЯВНО ПЕРЕДАНИЙ NAMESPACE
            if (room) {
                room.send({ type: 'GAME_UPDATE', data: payload })
            }
        }
    },
    customHandler: null,
    autoCleanupEmptyRoom: false,
})

const httpServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('Hello from HTTP server!\n')
})

const PORT = 8080

const app = new WebSocketApplication({
    server: httpServer,
    logger: appLogger,
    namespaceConfigs: namespaceConfigs,
    defaultNamespaceName: 'chat',
    heartbeatOptions: {
        // Передаємо опції Heartbeat
        pingInterval: 20 * 1000, // Пінгувати кожні 20 секунд
        pongTimeout: 5 * 1000, // Чекати понг 5 секунд
        checkDelayPerClient: 20, // Затримка 20 мс між пінгами клієнтам
    },
})

httpServer.listen(PORT, () => {
    appLogger.info(`HTTP server listening on port ${PORT}`)
})

const chatNamespace = app.getNamespace('chat')
if (chatNamespace) {
    chatNamespace.scheduleTask(
        'sendWelcomeMessage',
        (params) => {
            appLogger.info(`Sending welcome message in Namespace '${params.namespaceName}'`)
            chatNamespace.send({
                type: 'SYSTEM_MESSAGE',
                text: `Welcome to the ${params.namespaceName} server!`,
            })
        },
        { intervalMs: 30000, runOnActivation: true },
        { namespaceName: chatNamespace.name },
    )
}

setInterval(() => {
    if (app.totalClients > 0) {
        app.broadcast({
            type: 'SERVER_BROADCAST',
            text: `Server is active! Current clients: ${app.totalClients}`,
        })
    }
}, 60 * 1000)

process.on('SIGINT', async () => {
    appLogger.info('SIGINT signal received. Shutting down...')
    await app.stop()
    httpServer.close(() => {
        appLogger.info('HTTP server closed.')
        process.exit(0)
    })
})
