// src/repositories/UserRepository.js
import { User } from '../core/entities/User.js'

export class UserRepository {
    constructor(dbService) {
        this.db = dbService // OracleDatabaseService
    }

    async getById(id) {
        const sql = `SELECT USER_ID as id, NAME, EMAIL, ROLE FROM USERS WHERE USER_ID = :id`
        const result = await this.db.execute(sql, { id })
        return result.rows?.[0] ? new User(result.rows[0]) : null
    }

    async getAll(limit = 10) {
        const sql = `SELECT USER_ID as id, NAME, EMAIL, ROLE FROM USERS FETCH FIRST :limit ROWS ONLY`
        const result = await this.db.execute(sql, { limit })
        return result.rows.map((row) => new User(row))
    }

    async create(userData) {
        const sql = `INSERT INTO USERS (NAME, EMAIL, ROLE) VALUES (:name, :email, :role) RETURNING USER_ID INTO :id`
        // Логіка вашої обгортки для виконання insert
        const result = await this.db.execute(sql, userData)
        return result.lastRowid
    }

    async update(id, updateData) {
        const sql = `UPDATE USERS SET NAME = :name WHERE USER_ID = :id`
        await this.db.execute(sql, { id, ...updateData })
    }

    async delete(id) {
        const sql = `DELETE FROM USERS WHERE USER_ID = :id`
        await this.db.execute(sql, { id })
    }
}
