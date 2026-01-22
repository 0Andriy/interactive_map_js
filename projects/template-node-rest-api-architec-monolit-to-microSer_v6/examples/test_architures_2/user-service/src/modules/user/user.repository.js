// src/modules/user/user.repository.js
import { UserEntity } from './user.model.js'

export class UserRepository {
    constructor(db) {
        this.db = db
    }

    async findByEmail(email) {
        const sql = `SELECT * FROM users WHERE email = :email`
        const result = await this.db.execute(sql, [email])

        if (result.rows.length === 0) return null
        return new UserEntity(result.rows[0])
    }

    async create(data) {
        const sql = `INSERT INTO users (email, password_hash, full_name)
                 VALUES (:email, :pw, :name) RETURNING id INTO :id`
        // Логіка запису...
        return id
    }
}
