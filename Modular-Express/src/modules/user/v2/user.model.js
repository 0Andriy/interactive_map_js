// user.model.js
import UserSchema from './user.schema.js'
import Role from '../role/role.model.js'

/**
 * Клас User (Domain Entity).
 * Підтримує зв'язок Many-to-Many з ролями.
 */
class User {
    constructor(data = {}) {
        // Основні поля користувача
        Object.keys(UserSchema.columns).forEach((property) => {
            this[property] = data[property] !== undefined ? data[property] : null
        })

        // Масив ролей (колекція об'єктів класу Role)
        this.roles = Array.isArray(data.roles)
            ? data.roles.map((role) => (role instanceof Role ? role : new Role(role)))
            : []
    }

    /**
     * Створює модель користувача з результатів запиту Oracle.
     * @param {Object} row - Дані користувача
     * @param {Array} rolesRows - Рядки ролей з Oracle
     */
    static fromDatabase(row, rolesRows = []) {
        const userData = {}
        Object.entries(UserSchema.columns).forEach(([prop, config]) => {
            userData[prop] = row[config.name]
        })

        // Мапимо сирі рядки ролей у моделі Role
        userData.roles = rolesRows.map((roleRow) => Role.fromDatabase(roleRow))

        return new User(userData)
    }

    /**
     * Мапить властивості користувача на назви колонок Oracle.
     */
    toDatabaseNames() {
        const dbRow = {}
        Object.entries(UserSchema.columns).forEach(([prop, config]) => {
            if (this[prop] !== undefined && this[prop] !== null) {
                dbRow[config.name] = this[prop]
            }
        })
        return dbRow
    }

    /**
     * Серіалізація в JSON.
     * Приховує пароль та інші hidden поля, а також серіалізує вкладені ролі.
     */
    toJSON() {
        const json = {}
        Object.entries(UserSchema.columns).forEach(([prop, config]) => {
            if (!config.hidden) {
                json[prop] = this[prop]
            }
        })

        // Додаємо ролі до JSON відповіді
        json.roles = this.roles.map((role) => role.toJSON())

        return json
    }
}

export default User
