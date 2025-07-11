// index.js
import { ConsoleLogger } from './src/adapters/ConsoleLogger.js'
import { RealtimeServer } from './src/core/RealtimeServer.js'
import { ServiceFactory } from './src/factories/ServiceFactory.js'

async function main() {
    const logger = new ConsoleLogger()
    const wsPort = 8080
    const factoryConfig = {
        mode: 'distributed',
        redis: { url: 'redis://localhost:6379' },
        leaderKey: 'global_app_leader',
        leaderTtlMs: 15000,
        leaderRenewalIntervalMs: 5000,
    }
    logger.log('Running in DISTRIBUTED mode (Redis storage and pub/sub, with Leader Election).')

    const serviceFactory = new ServiceFactory(logger, factoryConfig)
    const server = new RealtimeServer(logger, { port: wsPort }, serviceFactory)

    try {
        await server.connect()

        // Створюємо простори імен, які автоматично оберуть свої класи
        const chatNamespace = server.getOrCreateNamespace('chat', {
            autoDeleteEmpty: true,
            emptyTimeoutMs: 5000,
        })

        const gameNamespace = server.getOrCreateNamespace('game', {
            autoDeleteEmpty: false, // Наприклад, ігрові кімнати не видаляємо
        })

        // Задача, що виконується лише на лідері
        chatNamespace.addGlobalScheduledTask(
            'databaseSynchronizer',
            { intervalMs: 20000, runOnActivation: true, runOnlyOnLeader: true },
            async (params) => {
                const { namespace, storage } = params
                logger.log(`[LEADER TASK] Running DB sync for namespace '${namespace.id}'`)
                const totalUsersAcrossAllRooms = (await storage.get('totalUsersCache')) || 0
                logger.log(
                    `[LEADER TASK] Simulating DB sync. Last known total users: ${totalUsersAcrossAllRooms}`,
                )
                await namespace.publish(`global_data_sync:${namespace.id}`, {
                    type: 'globalDataUpdate',
                    data: {
                        lastSyncTime: Date.now(),
                        totalUsers: totalUsersAcrossAllRooms,
                    },
                })
                return { status: 'synced', timestamp: Date.now() }
            },
            {},
        )

        const pubSub = serviceFactory.getPubSub()
        pubSub.subscribe(`global_data_sync:chat`, (channel, data) => {
            logger.log(
                `[NON-LEADER/LEADER] Received global data update from leader on channel '${channel}':`,
                data,
            )
        })

        logger.log(`Realtime Server is running on port ${wsPort}.`)
    } catch (error) {
        logger.error('Failed to start RealtimeServer:', error)
        await server
            .shutdown()
            .catch((e) => logger.error('Error during shutdown after startup failure:', e))
        process.exit(1)
    }
}

main().catch(console.error)
