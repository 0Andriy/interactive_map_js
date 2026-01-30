/**
 * @file Модель користувача для мапінгу даних між БД та додатком.
 */

export class User {
    /**
     * @param {object} params
     * @param {string} params.id - Унікальний ідентифікатор
     * @param {string} params.username - Логін користувача
     * @param {string} params.email - Електронна пошта
     * @param {string} [params.password] - Хешований пароль (тільки для внутрішнього використання)
     * @param {string[]} [params.roles] - Масив ролей (напр. ['USER', 'ADMIN'])
     * @param {boolean} [params.isActive] - Статус аккаунта
     * @param {Date} [params.lastLogin] - Дата останнього входу
     * @param {Date} [params.createdAt] - Дата створення
     * @param {Date} [params.updatedAt] - Дата оновлення
     */
    constructor({
        id,
        username,
        email,
        password,
        roles = [],
        isActive = true,
        lastLogin = null,
        createdAt = null,
        updatedAt = null,
    }) {
        this.id = id
        this.username = username
        this.email = email
        this.password = password
        this.roles = Array.isArray(roles) ? roles : JSON.parse(roles || '[]')
        this.isActive = Boolean(isActive)
        this.lastLogin = lastLogin ? new Date(lastLogin) : null
        this.createdAt = createdAt ? new Date(createdAt) : null
        this.updatedAt = updatedAt ? new Date(updatedAt) : null
    }

    /**
     * Статичний фабричний метод для створення моделі з рядка бази даних.
     * Тут ми мапимо специфічні назви колонок Oracle (напр. USER_ID, IS_ACTIVE).
     */
    static fromDb(row) {
        if (!row) return null

        return new User({
            id: row.ID || row.USER_ID,
            username: row.USERNAME,
            email: row.EMAIL,
            password: row.PASSWORD,
            roles: row.ROLES, // Припускаємо, що в БД це JSON-рядок або CLOB
            isActive: row.IS_ACTIVE === 1 || row.IS_ACTIVE === 'Y' || row.IS_ACTIVE === true,
            lastLogin: row.LAST_LOGIN,
            createdAt: row.CREATED_AT,
            updatedAt: row.UPDATED_AT,
        })
    }

    /**
     * Підготовка даних для SQL запитів (INSERT/UPDATE).
     * Конвертує об'єкт у плоский формат, який розуміє драйвер бази.
     */
    toDb() {
        return {
            id: this.id,
            username: this.username,
            email: this.email,
            password: this.password,
            roles: JSON.stringify(this.roles),
            is_active: this.isActive ? 1 : 0, // Приклад конвертації для Oracle NUMBER(1)
            last_login: this.lastLogin,
            updated_at: new Date(),
        }
    }

    /**
     * Автоматично викликається при res.json(user).
     * Видаляє конфіденційні дані перед відправкою клієнту.
     */
    toJSON() {
        const { password, ...publicUser } = this
        return publicUser
    }

    // --- Бізнес-методи моделі (Domain Logic) ---

    /** Перевіряє, чи є користувач адміністратором */
    isAdmin() {
        return this.roles.includes('ADMIN')
    }

    /** Перевіряє, чи активний аккаунт */
    canLogin() {
        return this.isActive === true
    }
}

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           example: "105"
 *         username:
 *           type: string
 *           example: "jdoe_dev"
 *         email:
 *           type: string
 *           format: email
 *           example: "j.doe@example.com"
 *         roles:
 *           type: array
 *           items:
 *             type: string
 *           example: ["USER", "EDITOR"]
 *         isActive:
 *           type: boolean
 *           example: true
 *         lastLogin:
 *           type: string
 *           format: date-time
 *         createdAt:
 *           type: string
 *           format: date-time
 */
