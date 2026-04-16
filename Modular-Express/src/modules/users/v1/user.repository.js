/**
 * @file Репозиторій для роботи з таблицею користувачів в Oracle.
 */
import { User } from './user.model.js'
import { getContext } from '../../../common/utils/context.js'

export class UserRepository {
    /**
     * @param {object} dbManager - Менеджер пулів Oracle
     */
    constructor(dbManager) {
        this.dbManager = dbManager
    }

    /**
     * Отримує екзекутор для поточної БД з контексту запиту
     * @private
     */
    async _getExecutor() {
        const { dbName } = getContext()
        if (!dbName) throw new Error('Database context (dbName) is missing')
        return await this.dbManager.get(dbName)
    }

    /**
     * Пошук користувачів з пагінацією та фільтрацією
     * @param {object} params
     * @param {number} params.page - Номер сторінки (з 1)
     * @param {number} params.limit - Кількість записів
     * @param {string} [params.search] - Пошуковий запит (email/username)
     */
    async findPaginated({ page = 1, limit = 10, search = '' }) {
        const db = await this._getExecutor()
        const offset = (page - 1) * limit

        // SQL для підрахунку загальної кількості (для фронтенда)
        const countSql = `
            SELECT COUNT(*) as total FROM users
            WHERE lower(username) LIKE lower(:search) OR lower(email) LIKE lower(:search)
        `

        // SQL з пагінацією (Oracle 12c+)
        const dataSql = `
            SELECT * FROM users
            WHERE lower(username) LIKE lower(:search) OR lower(email) LIKE lower(:search)
            ORDER BY created_at DESC
            OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
        `

        const bindParams = {
            search: `%${search}%`,
            offset: offset,
            limit: limit,
        }

        const [countResult, dataResult] = await Promise.all([
            db.execute(countSql, { search: bindParams.search }),
            db.execute(dataSql, bindParams),
        ])

        return {
            items: dataResult.rows.map((row) => User.fromDb(row)),
            total: countResult.rows[0].TOTAL,
            page,
            limit,
        }
    }

    // async findAll() {
    //     const db = await this._getExecutor()
    //     const sql = `SELECT id, username, email, roles FROM users`
    //     const result = await db.execute(sql)
    //     return result.rows.map(User.fromDb)
    // }

    /**
     * Пошук одного за ID
     */
    async findById(id) {
        const db = await this._getExecutor()
        const sql = `SELECT * FROM users WHERE id = :id`
        const result = await db.execute(sql, { id })
        return User.fromDb(result.rows?.[0])

        // return result.rows?.[0] || null
    }

    /**
     * Пошук за Email (унікальне поле)
     */
    async findByEmail(email) {
        const db = await this._getExecutor()
        const sql = `SELECT * FROM users WHERE email = :email`
        const result = await db.execute(sql, { email })
        return User.fromDb(result.rows[0])
    }

    /**
     * Створення нового користувача
     */
    async create(userModel) {
        const db = await this._getExecutor()
        const data = userModel.toDb()

        const sql = `
            INSERT INTO users (username, email, password, roles, is_active)
            VALUES (:username, :email, :password, :roles, :is_active)
            RETURNING id INTO :id
        `

        // Використовуємо bind-змінну для отримання згенерованого ID
        const result = await db.execute(sql, {
            ...data,
            id: { type: 'NUMBER', dir: 'OUT' },
        })

        return result.outBinds.id[0]
    }

    /**
     * Оновлення існуючого
     */
    async update(id, userModel) {
        const db = await this._getExecutor()
        const data = userModel.toDb()

        const sql = `
            UPDATE users
            SET username = :username,
                email = :email,
                roles = :roles,
                is_active = :is_active,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = :id
        `

        await db.execute(sql, { ...data, id })
        return true
    }

    // async update(id, data) {
    //     const db = await this._getExecutor()
    //     const sets = Object.keys(data)
    //         .map((key) => `${key} = :${key}`)
    //         .join(', ')
    //     const sql = `UPDATE users SET ${sets} WHERE id = :id`
    //     return await db.execute(sql, { ...data, id })
    // }

    /**
     * Видалення (або Soft Delete)
     */
    async delete(id) {
        const db = await this._getExecutor()
        const sql = `DELETE FROM users WHERE id = :id`
        await db.execute(sql, { id })
        return true
    }
}
