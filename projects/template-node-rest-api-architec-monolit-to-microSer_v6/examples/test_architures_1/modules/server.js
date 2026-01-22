import { createApp } from './app.js'
import { OracleDatabaseManager } from './shared/OracleDatabaseManager.js'
import { MessageBroker } from './shared/MessageBroker.js'

async function bootstrap() {
    try {
        // 1. Налаштування бази
        const dbManager = new OracleDatabaseManager(console)
        await dbManager.register('CORE_UA', { user: 'sys', password: 'password' })

        // 2. Налаштування брокера
        const broker = new MessageBroker()
        await broker.connect('amqp://localhost')

        // 3. Старт Express
        const app = createApp(dbManager, broker)

        app.listen(3000, () => {
            console.log('🚀 Server running on http://localhost:3000')
        })
    } catch (err) {
        console.error('Fatal error during bootstrap:', err)
    }
}

bootstrap()
