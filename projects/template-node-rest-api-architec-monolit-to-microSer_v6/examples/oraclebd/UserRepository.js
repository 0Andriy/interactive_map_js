/**
 * UserRepository - приклад репозиторію сутності з використанням стандартних назв методів.
 * Всі методи підтримують передачу internalCtx для відстеження транзакцій та трейсінгу.
 */
export class UserRepository {
    /**
     * @param {OracleDatabaseService} db - Інстанс нашої обгортки над Oracle
     */
    constructor(db) {
        this.db = db
        this.tableName = 'USERS'
    }

    /**
     * Пошук одного запису за первинним ключем (ID).
     */
    async findById(id, internalCtx = {}) {
        const sql = `SELECT * FROM ${this.tableName} WHERE id = :id`
        return await this.db.findOne(sql, { id }, {}, internalCtx)
    }

    /**
     * Пошук одного запису за довільним критерієм (наприклад, email).
     */
    async findOne(email, internalCtx = {}) {
        const sql = `SELECT * FROM ${this.tableName} WHERE email = :email AND rownum = 1`
        return await this.db.findOne(sql, { email }, {}, internalCtx)
    }

    /**
     * Отримання списку всіх записів.
     */
    async findAll(internalCtx = {}) {
        const sql = `SELECT * FROM ${this.tableName}`
        return await this.db.select(sql, {}, {}, internalCtx)
    }

    /**
     * Пошук декількох записів за певною умовою (наприклад, роль).
     */
    async findMany(role, internalCtx = {}) {
        const sql = `SELECT * FROM ${this.tableName} WHERE role = :role`
        return await this.db.select(sql, { role }, {}, internalCtx)
    }

    /**
     * Перевірка чи існує запис.
     */
    async exists(id, internalCtx = {}) {
        const sql = `SELECT COUNT(*) FROM ${this.tableName} WHERE id = :id`
        const count = await this.db.scalar(sql, { id }, {}, internalCtx)
        return count > 0
    }

    /**
     * Створення нового запису.
     */
    async create(userData, internalCtx = {}) {
        const sql = `
            INSERT INTO ${this.tableName} (id, name, email, role)
            VALUES (users_seq.NEXTVAL, :name, :email, :role)
        `
        return await this.db.execute(sql, userData, { autoCommit: true }, internalCtx)
    }

    /**
     * Масове створення записів (Bulk Insert).
     */
    async createMany(usersArray, internalCtx = {}) {
        const sql = `INSERT INTO ${this.tableName} (id, name, email) VALUES (:1, :2, :3)`
        return await this.db.executeMany(sql, usersArray, { autoCommit: true }, internalCtx)
    }

    /**
     * Оновлення запису за ID.
     */
    async update(id, updateData, internalCtx = {}) {
        const sql = `UPDATE ${this.tableName} SET name = :name, role = :role WHERE id = :id`
        return await this.db.execute(sql, { ...updateData, id }, { autoCommit: true }, internalCtx)
    }

    /**
     * Видалення запису за ID (Hard delete).
     */
    async delete(id, internalCtx = {}) {
        const sql = `DELETE FROM ${this.tableName} WHERE id = :id`
        return await this.db.execute(sql, { id }, { autoCommit: true }, internalCtx)
    }

    /**
     * "М'яке" видалення (Soft delete).
     */
    async softDelete(id, internalCtx = {}) {
        const sql = `UPDATE ${this.tableName} SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE id = :id`
        return await this.db.execute(sql, { id }, { autoCommit: true }, internalCtx)
    }

    /**
     * Агрегація: Кількість записів за умовою.
     */
    async count(role, internalCtx = {}) {
        const sql = `SELECT COUNT(*) FROM ${this.tableName} WHERE role = :role`
        return await this.db.scalar(sql, { role }, {}, internalCtx)
    }
}
