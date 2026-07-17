// database/unit-of-work.js
import { EventEmitter } from 'events'

// TransactionContext
export class UnitOfWork {
    constructor(dbService) {
        this.dbService = dbService
        this.connection = null
        this.isActive = false
    }

    async start() {
        // Беремо одне виділене з'єднання з вашого пулу/сервісу
        this.connection = await this.dbService.getPoolConnection()
        this.isActive = true

        // Створюємо internalCtx, який буде передаватися між модулями
        this.ctx = {
            connection: this.connection,
            startTime: Date.now(),
            traceId: Math.random().toString(36).substring(2, 9),
            isTransaction: true,
        }
        return this.ctx
    }

    async commit() {
        if (!this.isActive) return
        await this.connection.commit()
    }

    async rollback() {
        if (!this.isActive) return
        await this.connection.rollback()
    }

    async release() {
        if (!this.isActive) return

        await this.connection.close() // Повертаємо в пул тільки тут!
        this.isActive = false
        this.connection = null
    }
}
