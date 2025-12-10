// server.js (Приклад ініціалізації)
import WsServerManager from './WsServerManager.js'

// 1. Імітація логера та PubSub брокера (можна замінити на Winston/Redis)
const myLogger = console
// const redisClient = require('redis').createClient();
const myPubSubBroker = {
    publish: (channel, message) => myLogger.log(`[PUBSUB:PUBLISH] ${channel}: ${message}`),
    subscribe: (channel) => myLogger.log(`[PUBSUB:SUBSCRIBE] ${channel}`),
}

// 2. Визначення зовнішніх обробників логіки
const chatNamespaceHandler = (chatNS, connection, type, payload) => {
    switch (type) {
        case 'JOIN_ROOM':
            chatNS.joinRoom(payload.roomName || 'general', connection.id)
            connection.send(JSON.stringify({ success: `Joined room ${payload.roomName}` }))
            // Якщо використовуємо масштабування, також публікуємо в Redis
            // chatNS.publishToBroker('chat_events', JSON.stringify({ type: 'USER_JOINED', ... }));
            break

        case 'SEND_MESSAGE':
            const messageData = JSON.stringify({
                type: 'NEW_MESSAGE',
                user: connection.getUserId(),
                text: payload.text,
            })
            chatNS.broadcastToRoom(payload.roomName, messageData, connection.id)
            break

        case 'AUTHENTICATE':
            connection.authenticate(payload.userId)
            break
    }
}

const gameNamespaceHandler = (gameNS, connection, type, payload) => {
    // Логіка гри тут
    if (type === 'MOVE') {
        gameNS.broadcastToRoom('lobby_1', JSON.stringify({ move: payload.move }))
    }
}

// 3. Конфігурація та запуск менеджера
const serverConfig = {
    port: 8080,
    logger: myLogger,
    // pubSubBroker: myPubSubBroker, // Розкоментувати для масштабування
    namespaceHandlers: {
        chat: chatNamespaceHandler,
        game: gameNamespaceHandler,
    },
}

new WsServerManager(serverConfig)
