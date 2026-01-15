// services/UserService.js
import { dbManager } from '../infrastructure/db.js'

export class UserService {
    async findById(userId) {
        const sql = `SELECT * FROM users WHERE id = :id`
        const result = await this.db.execute(sql, { id: userId })
        return result.rows[0]
    }

    async getUserData(userId) {
        // Отримуємо конкретний сервіс через менеджер
        const db = dbManager.db('MAIN')

        return await db.findOne('SELECT * FROM users WHERE id = :id', { id: userId })
    }

    async updateBalance(userId, amount) {
        const billingDb = dbManager.db('BILLING')

        // Використовуємо транзакцію, логер та всі наші Best Practices
        return await billingDb.withTransaction(async (tx) => {
            await tx.execute('UPDATE accounts SET balance = balance + :amt WHERE user_id = :id', {
                amt: amount,
                id: userId,
            })
            // ... інша логіка
        })
    }
}
