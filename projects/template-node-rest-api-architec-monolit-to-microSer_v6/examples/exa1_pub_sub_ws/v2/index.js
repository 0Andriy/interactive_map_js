import { RealtimeServer } from './src/core/RealtimeServer.js'
// import { ConsoleLogger } from './logger.js'
import { ServiceFactory } from './src/factories/ServiceFactory.js'

async function main() {
    const logger = console //new ConsoleLogger()
    const wsPort = 8080

    // --- Варіант 1: Монолітний режим (без Redis) ---
    // const factoryConfig = { mode: 'monolithic' };
    // logger.log("Running in MONOLITHIC mode (in-memory storage and pub/sub).");

    // --- Варіант 2: Розподілений режим (з Redis) ---
    // Переконайтеся, що у вас запущений Redis сервер (docker run --name my-redis -p 6379:6379 -d redis)
    const factoryConfig = {
        mode: 'distributed',
        redis: { url: 'redis://localhost:6379' },
    }
    logger.log('Running in DISTRIBUTED mode (Redis storage and pub/sub).')

    const serviceFactory = new ServiceFactory(logger, factoryConfig)

    // Ініціалізуємо сервер, передаючи логер та фабрику
    const server = new RealtimeServer(logger, { port: wsPort }, serviceFactory)

    try {
        await server.connect() // Підключаємо внутрішні сервіси (Storage, Pub/Sub)

        // --- Налаштування простору імен 'chat' ---
        const chatNamespace = await server.getOrCreateNamespace('chat', {
            autoDeleteEmpty: true,
            emptyTimeoutMs: 5000, // Видаляти порожні кімнати через 5 секунд
        })

        // Приклад використання глобальної задачі в просторі імен 'chat'
        chatNamespace.addGlobalScheduledTask(
            'globalChatUpdater',
            { intervalMs: 10000, runOnActivation: true },
            async (params) => {
                const { namespace, storage } = params
                logger.log(
                    `[Chat Namespace] Global update task running. Namespace: ${namespace.id}`,
                )

                // Приклад: отримати список всіх активних кімнат у цьому просторі імен
                const roomKeysPattern = `room_users:${namespace.id}:*`
                const allRoomKeys = await storage.listKeys(roomKeysPattern)
                logger.log(`Active chat room keys:`, allRoomKeys)

                let totalChatUsers = 0
                // Приклад: якщо потрібно дізнатися загальну кількість користувачів
                for (const key of allRoomKeys) {
                    const count = await storage.getSetSize(key)
                    totalChatUsers += count
                }
                logger.log(
                    `Total active users in chat namespace (across all instances): ${totalChatUsers}`,
                )

                return { status: 'ok', timestamp: Date.now(), totalUsers: totalChatUsers }
            },
            { data: 'some global chat data' },
        )

        // --- Налаштування простору імен 'game' ---
        const gameNamespace = await server.getOrCreateNamespace('game', {
            autoDeleteEmpty: false, // Ігрові кімнати не видаляються автоматично (наприклад, для реплеїв)
        })

        // Приклад створення кімнати 'lobby' в просторі імен 'game'
        const lobbyRoom = await gameNamespace.getOrCreateRoom('lobby')

        // Приклад періодичної задачі для кімнати (працює тільки коли є користувачі)
        lobbyRoom.addScheduledTask(
            'lobbyHeartbeat',
            { intervalMs: 3000, runOnActivation: true },
            async (params) => {
                const { room, wsAdapter } = params // Room та WsAdapter передаються автоматично
                const usersInRoom = await room.getUsers()
                logger.log(
                    `[Game:Lobby] Heartbeat task running. Users: ${usersInRoom.length}, Params:`,
                    params,
                )

                if (usersInRoom.length > 0) {
                    // Розсилка всім учасникам кімнати про поточний стан лобі
                    wsAdapter.broadcastToUsers(usersInRoom, {
                        type: 'lobbyUpdate',
                        users: usersInRoom,
                        time: Date.now(),
                    })
                } else {
                    logger.debug(`[Game:Lobby] Lobby Heartbeat paused, no users.`)
                }
                return { users: usersInRoom.length, time: Date.now() }
            },
            { status: 'active' },
        )

        // Приклад: створимо ще одну ігрову кімнату
        const gameRoom1 = await gameNamespace.getOrCreateRoom('game123', {
            autoDeleteEmpty: true,
            emptyTimeoutMs: 15000, // Для ігрових кімнат може бути довший таймаут
        })

        gameRoom1.addScheduledTask(
            'gameLoop',
            { intervalMs: 1000, runOnActivation: true },
            async (params) => {
                const { room, wsAdapter } = params
                const currentTurn = (params.turn || 0) + 1
                params.turn = currentTurn // Оновлюємо параметр для наступного виклику

                const usersInRoom = await room.getUsers()
                logger.log(
                    `[Game:game123] Game loop running. Users: ${usersInRoom.length}, Turn: ${currentTurn}`,
                )

                if (usersInRoom.length > 0) {
                    // Симуляція ігрового оновлення
                    const gameData = {
                        type: 'gameUpdate',
                        turn: currentTurn,
                        players: usersInRoom,
                        boardState: `board_state_turn_${currentTurn}`,
                    }
                    // Відправляємо всім користувачам у кімнаті
                    wsAdapter.broadcastToUsers(usersInRoom, gameData)
                } else {
                    logger.debug(`[Game:game123] Game loop paused, no users.`)
                }
                return { gameStatus: 'running', currentTurn: currentTurn }
            },
            { turn: 0 },
        )

        logger.log(`Realtime server listening on ws://localhost:${wsPort}`)

        // Для демонстрації зупинки сервера через деякий час
        setTimeout(async () => {
            logger.log('Shutting down server...')
            await server.shutdown()
            logger.log('Server shut down complete.')
        }, 30 * 60 * 1000) // 30 хвилин для тестування
    } catch (error) {
        logger.error('Failed to start RealtimeServer:', error)
        // Додатково можна очистити ресурси, якщо щось пішло не так при старті
        await server
            .shutdown()
            .catch((e) => logger.error('Error during shutdown after startup failure:', e))
        process.exit(1)
    }
}

async function main() {
    const logger = new ConsoleLogger()
    const wsPort = 8080

    // --- Варіант 1: Монолітний режим (без Redis) ---
    // const factoryConfig = { mode: 'monolithic' };
    // logger.log("Running in MONOLITHIC mode (in-memory storage and pub/sub).");

    // --- Варіант 2: Розподілений режим (з Redis) ---
    const factoryConfig = {
        mode: 'distributed',
        redis: { url: 'redis://localhost:6379' },
        leaderKey: 'global_app_leader', // Опціонально: свій ключ для лідера
        leaderTtlMs: 15000, // Лідер блокує на 15 секунд
        leaderRenewalIntervalMs: 5000, // Оновлює кожні 5 секунд
    }
    logger.log('Running in DISTRIBUTED mode (Redis storage and pub/sub, with Leader Election).')

    const serviceFactory = new ServiceFactory(logger, factoryConfig)

    const server = new RealtimeServer(logger, { port: wsPort }, serviceFactory)

    try {
        await server.connect() // Підключаємо внутрішні сервіси, включаючи LeaderElection

        const chatNamespace = await server.getOrCreateNamespace('chat', {
            autoDeleteEmpty: true,
            emptyTimeoutMs: 5000,
        })

        // Приклад: задача, що виконується ЛИШЕ лідером
        chatNamespace.addGlobalScheduledTask(
            'databaseSynchronizer',
            { intervalMs: 20000, runOnActivation: true, runOnlyOnLeader: true }, // Новий параметр
            async (params) => {
                const { namespace, storage } = params
                logger.log(
                    `[LEADER TASK] Running database synchronization for namespace '${namespace.id}'`,
                )
                // Тут логіка, що робить запити до БД, агрегує дані
                const totalUsersAcrossAllRooms = (await storage.get('totalUsersCache')) || 0 // Припустимо, що кеш є
                logger.log(
                    `[LEADER TASK] Simulating DB sync. Last known total users: ${totalUsersAcrossAllRooms}`,
                )

                // Розсилка даних всім інстансам через Pub/Sub
                await namespace.publish(`global_data_sync:${namespace.id}`, {
                    type: 'globalDataUpdate',
                    data: {
                        lastSyncTime: Date.now(),
                        totalUsers: totalUsersAcrossAllRooms, // Або оновлені дані з БД
                    },
                })
                return { status: 'synced', timestamp: Date.now() }
            },
            {},
        )

        // Приклад: задача, яка слухає оновлення від лідера
        const pubSub = serviceFactory.getPubSub()
        pubSub.subscribe(`global_data_sync:chat`, (channel, data) => {
            logger.log(
                `[NON-LEADER/LEADER] Received global data update from leader on channel '${channel}':`,
                data,
            )
            // Тут логіка для всіх інстансів: оновити локальний кеш, UI тощо
            // Наприклад, оновити дашборд оператора на кожному інстансі
            // logger.log(`Updated local cache with total users: ${data.data.totalUsers}`);
        })

        // ... (решта коду без змін)
    } catch (error) {
        logger.error('Failed to start RealtimeServer:', error)
        await server
            .shutdown()
            .catch((e) => logger.error('Error during shutdown after startup failure:', e))
        process.exit(1)
    }
}

main().catch(console.error)
