// src/index.js (Фрагмент коду)

// ... імпорти ...

async function bootstrap() {
    // ... (Створення logger, pubSubAdapter) ...

    const logger = new Logger(process.env.NODE_ID)
    const redisConfig = { host: '127.0.0.1', port: 6379 }
    const pubSubAdapter = new RedisPubSubAdapter(redisConfig)
    const socketManager = new SocketManager(pubSubAdapter, logger)

    // --- 1. Кастомні Обробники для Namespace ---

    // 1.1 Обробник для Namespace '/ws/chat'
    const chatMessageHandler = async (conn, message, ns) => {
        if (message.type === 'chat:message') {
            // Логіка обробки повідомлення чату
            await ns.to(message.data.roomId || 'general', 'chat:new_message', {
                user: conn.userId,
                text: message.data.text,
            })
        } else if (message.type === 'chat:pm') {
            // Приватне повідомлення (використовуємо toUser)
            await ns.toUser(message.data.targetId, 'chat:private', {
                sender: conn.userId,
                text: message.data.text,
            })
        } else {
            conn.send('error', { reason: 'Unknown chat command' })
        }
    }

    // 1.2 Обробник для Namespace '/ws/game'
    const gameMessageHandler = async (conn, message, ns) => {
        if (message.type === 'game:move') {
            // Логіка гри: перевірка ходу, оновлення стану
            ns.logger.log(`User ${conn.userId} made a move in room ${message.data.gameId}`)
            await ns.to(message.data.gameId, 'game:state_update', message.data.payload)
        } else {
            conn.send('error', { reason: 'Unknown game command' })
        }
    }

    // --- 2. Реєстрація Namespace з обробниками ---

    socketManager.getNamespace('default') // Default (використовує defaultHandler)
    socketManager.getNamespace('chat', chatMessageHandler)
    socketManager.getNamespace('game', gameMessageHandler)

    // ---------------------------------------------

    // ... (Створення httpServer, wss та setupWebSocketAuth) ...
}
