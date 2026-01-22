// src/modules/users/users.repository.js
import { User } from './entities/user.entity.js'

import oracledb from 'oracledb'

export class UsersRepository {
    /**
     * @param {OracleDatabaseManager} dbManager
     */
    constructor(dbManager) {
        this.dbManager = dbManager
    }
    // Приватний метод для внутрішнього мапінгу
    _mapToEntity(raw) {
        if (!raw) return null
        return new User({
            id: raw.ID,
            email: raw.EMAIL,
            password: raw.PASSWORD,
            fullName: raw.FULL_NAME,
        })
    }

    /**
     * @param {string} dbAlias - 'CORE', 'BILLING' тощо
     * @param {string} email
     */
    async findByEmail(dbAlias, email) {
        // Динамічно отримуємо потрібний інстанс бази
        const db = this.dbManager.db(dbAlias)

        const sql = `SELECT * FROM users WHERE email = :email`
        const result = await db.execute(sql, { email })

        if (!result.rows?.length) return null
        const raw = result.rows[0]

        // Повертаємо вже готовий об'єкт User
        return this._mapToEntity(raw)
    }

    async save(dbAlias, userData) {
        // Динамічно отримуємо потрібний інстанс бази
        const db = this.dbManager.db(dbAlias)

        const sql = `
      INSERT INTO users (email, password, full_name)
      VALUES (:email, :password, :name)
      RETURNING id, email, full_name INTO :out_id, :out_email, :out_name`

        const params = {
            email: userData.email,
            password: userData.password,
            name: userData.fullName || null,
            out_id: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
            out_email: { type: oracledb.STRING, dir: oracledb.BIND_OUT },
            out_name: { type: oracledb.STRING, dir: oracledb.BIND_OUT },
        }

        const result = await db.execute(sql, params)

        // Створюємо Entity з результатів вставки
        return new User({
            id: result.outBinds.out_id[0],
            email: result.outBinds.out_email[0],
            fullName: result.outBinds.out_name[0],
        })
    }
}
