import { RealtimeServer } from './src/core/RealtimeServer.js'
// import { ConsoleLogger } from './logger.js' // Ваш власний логер

async function main() {
    const logger = console // Створюємо екземпляр логера

    // Ініціалізуємо сервер, передаючи логер через DI
    const server = new RealtimeServer(logger, { port: 8080 })

    // --- Налаштування простору імен 'chat' ---
    const chatNamespace = server.getOrCreateNamespace('chat', {
        autoDeleteEmpty: true,
        emptyTimeoutMs: 5000, // Видаляти порожні кімнати через 5 секунд
    })

    // Приклад використання глобальної задачі в просторі імен 'chat'
    chatNamespace.addGlobalScheduledTask(
        'globalChatUpdater',
        { intervalMs: 10000, runOnActivation: true },
        async (params) => {
            logger.log(`[Chat Namespace] Global update task running. Params:`, params)
            // Тут може бути логіка оновлення списку популярних кімнат або статистики
            return { status: 'ok', timestamp: Date.now() }
        },
        { data: 'some global chat data' },
    )

    // --- Налаштування простору імен 'game' ---
    const gameNamespace = server.getOrCreateNamespace('game', {
        autoDeleteEmpty: false, // Ігрові кімнати не видаляються автоматично (наприклад, для реплеїв)
    })

    // Приклад створення кімнати 'lobby' в просторі імен 'game'
    const lobbyRoom = gameNamespace.getOrCreateRoom('lobby')

    // Приклад періодичної задачі для кімнати (працює тільки коли є користувачі)
    lobbyRoom.addScheduledTask(
        'lobbyHeartbeat',
        { intervalMs: 3000, runOnActivation: true },
        async (params) => {
            logger.log(
                `[Game:Lobby] Heartbeat task running. Users: ${
                    lobbyRoom.getUsers().length
                }, Params:`,
                params,
            )
            // Тут можна оновлювати стан лобі, відправляти його користувачам
            return { users: lobbyRoom.getUsers().length, time: Date.now() }
        },
        { status: 'active' },
    )

    // Приклад: створимо ще одну ігрову кімнату
    const gameRoom1 = gameNamespace.getOrCreateRoom('game123', {
        autoDeleteEmpty: true,
        emptyTimeoutMs: 15000, // Для ігрових кімнат може бути довший таймаут
    })

    gameRoom1.addScheduledTask(
        'gameLoop',
        { intervalMs: 1000, runOnActivation: true },
        async (params) => {
            logger.log(
                `[Game:game123] Game loop running. Users: ${gameRoom1.getUsers().length}, Turn: ${
                    params.turn || 0
                }`,
            )
            params.turn = (params.turn || 0) + 1 // Оновлюємо параметр для наступного виклику
            // Тут може бути основний ігровий цикл, оновлення позицій гравців, перевірка умов перемоги
            return { gameStatus: 'running', currentTurn: params.turn }
        },
        { turn: 0 },
    )

    // Приклад взаємодії з клієнтом через WebSocket
    // Клієнт підключається до ws://localhost:8080/chat
    // Потім відправляє:
    // { type: "joinRoom", roomId: "general" }
    // { type: "roomMessage", roomId: "general", payload: "Hello from client!" }

    // Для демонстрації зупинки сервера через деякий час
    setTimeout(async () => {
        logger.log('Shutting down server in 30 seconds...')
        await server.shutdown()
    }, 30 * 1000 * 1000) // 30 секунд для тестування
}

main().catch(console.error)
