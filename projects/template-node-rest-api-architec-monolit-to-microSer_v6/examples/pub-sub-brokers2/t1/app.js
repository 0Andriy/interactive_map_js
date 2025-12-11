// app.js
import { WebSocketManager } from './WebSocketManager.js'
import { RedisService } from './RedisService.js'

// Simple mock logger (ES6 style)
const mockLogger = {
    info: (...args) => console.log('[INFO]', ...args),
    error: (...args) => console.error('[ERROR]', ...args),
}

const REDIS_URL = 'redis://localhost:6379'
const WS_PORT = 8080

// 1. Instantiate shared services/dependencies
const redisService = new RedisService(REDIS_URL, mockLogger)

// 2. Instantiate the Manager, injecting services
const manager = new WebSocketManager(WS_PORT, redisService, mockLogger)

// 3. Start the application
manager.start().catch((err) => {
    mockLogger.error('Fatal Application Error:', err)
})
