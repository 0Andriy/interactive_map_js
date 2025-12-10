// server.js
import WsServerManager from './WsServerManager.js'

// --- 1. Імітація залежностей (Логер та Pub/Sub Брокер) ---

/** Імітація логера (можна замінити на Winston або інший) */
const myLogger = console
myLogger.debug = myLogger.log // Додамо метод debug, якщо його немає

/**
 * Імітація PubSub брокера (наприклад, Redis клієнт).
 * У реальному додатку тут буде ваш справжній клієнт Redis.
 */
const myPubSubBroker = {
    publish: (channel, message) => {
        // У реальності Redis надсилає це іншим інстансам
        myLogger.log(`[PUBSUB:PUBLISH] Channel '${channel}': ${message.substring(0, 50)}...`)
    },
    // Метод subscribe повинен зберігати обробники,
    // але для простоти прикладу WsServerManager сам викликає підписку
    subscribe: (channel, handler) => {
        myLogger.log(`[PUBSUB:SUBSCRIBE] Підписано до каналу ${channel}`)
        // В реальності тут би зберігався handler для виклику при надходженні повідомлення
    },
}

// --- 2. Визначення зовнішніх обробників логіки (Handlers) ---

/**
 * Обробник логіки для простору імен 'chat'.
 * @param {WebSocketNamespace} chatNS - Екземпляр простору імен 'chat'.
 * @param {WebSocketConnection} connection - Конкретне з'єднання клієнта.
 * @param {string} type - Тип дії (наприклад, 'SEND_MESSAGE', 'JOIN_ROOM').
 * @param {object} payload - Дані дії.
 */
const chatNamespaceHandler = (chatNS, connection, type, payload) => {
    switch (type) {
        case 'JOIN_ROOM':
            const roomToJoin = payload.roomName || 'general'
            chatNS.joinRoom(roomToJoin, connection.id)
            connection.send(JSON.stringify({ namespace: 'chat', type: 'JOINED', room: roomToJoin }))

            const joinMessage = {
                type: 'USER_JOINED',
                userId: connection.getUserId() || connection.id,
            }
            chatNS.broadcastToRoom(roomToJoin, JSON.stringify(joinMessage))
            // В реальності тут також викликали б chatNS.publishToBroker(...) про факт приєднання
            break

        case 'SEND_MESSAGE':
            const targetRoom = payload.roomName || 'general'
            const messagePayload = {
                type: 'NEW_MESSAGE',
                user: connection.getUserId() || `Anonymous-${connection.id.substring(0, 4)}`,
                text: payload.text,
                timestamp: new Date().toISOString(),
            }

            // 1. Розсилка локальним клієнтам (всім на цьому інстансі сервера)
            chatNS.broadcastToRoom(targetRoom, JSON.stringify(messagePayload), connection.id)

            // 2. Публікація в брокер для інших інстансів сервера (масштабування)
            // Використовуємо метод, визначений у WebSocketNamespace.js
            chatNS.publishToBroker(targetRoom, messagePayload, connection.id)
            break

        case 'AUTHENTICATE':
            connection.authenticate(payload.userId)
            connection.send(
                JSON.stringify({
                    namespace: 'chat',
                    type: 'AUTHENTICATED',
                    userId: payload.userId,
                }),
            )
            break

        default:
            connection.send(
                JSON.stringify({ namespace: 'chat', error: `Unknown action type: ${type}` }),
            )
            break
    }
}

/**
 * Обробник логіки для простору імен 'game'.
 * (Тут може бути інша логіка, наприклад, перевірка ігрових ходів)
 */
const gameNamespaceHandler = (gameNS, connection, type, payload) => {
    switch (type) {
        case 'MOVE':
            // Перевірка валідності ходу, оновлення стану гри
            myLogger.log(`Гравець ${connection.id} зробив хід: ${JSON.stringify(payload)}`)
            gameNS.broadcastToRoom(
                'lobby_1',
                JSON.stringify({ namespace: 'game', type: 'PLAYER_MOVED', data: payload }),
            )
            break
        // ... інші ігрові події
    }
}

// --- 3. Конфігурація та запуск менеджера ---

const serverConfig = {
    port: 8080,
    logger: myLogger,
    pubSubBroker: myPubSubBroker, // Передаємо брокер для масштабування
    namespaceHandlers: {
        // Прив'язуємо функції-обробники до назв просторів імен
        chat: chatNamespaceHandler,
        game: gameNamespaceHandler,
    },
}

// Створюємо та запускаємо основний менеджер сервера
const manager = new WsServerManager(serverConfig)

console.log('WebSocket Architecture Example Running.')
console.log('Test with a WebSocket client connecting to ws://localhost:8080')

// Приклад того, як клієнт може надіслати повідомлення:
// ws.send(JSON.stringify({ namespace: 'chat', type: 'JOIN_ROOM', payload: { roomName: 'general' } }));
// ws.send(JSON.stringify({ namespace: 'chat', type: 'SEND_MESSAGE', payload: { roomName: 'general', text: 'Привіт світ!' } }));
