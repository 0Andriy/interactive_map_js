import RoleSchema from './role.schema.js'

/**
 * Клас Role (Domain Entity).
 * Забезпечує роботу з даними без прямої прив'язки до назв колонок БД.
 */
class Role {
    constructor(data = {}) {
        Object.keys(RoleSchema.columns).forEach((property) => {
            this[property] = data[property] !== undefined ? data[property] : null
        })
    }

    /**
     * Статичний метод для створення моделі з результатів запиту Oracle (Row до Object)
     * @param {Object} row - Сирий рядок з oracleDB (наприклад, { ROLE_ID: 1, ROLE_NAME: 'Admin' })
     */
    static fromDatabase(row) {
        const data = {}
        Object.entries(RoleSchema.columns).forEach(([prop, config]) => {
            data[prop] = row[config.name]
        })
        return new Role(data)
    }

    /**
     * Метод для перетворення моделі у формат, придатний для SQL-запитів (Object до Row)
     */
    toDatabaseNames() {
        const dbRow = {}
        Object.entries(RoleSchema.columns).forEach(([prop, config]) => {
            if (this[prop] !== undefined) {
                dbRow[config.name] = this[prop]
            }
        })
        return dbRow
    }

    /**
     * Метод для серіалізації в JSON.
     * Викликається автоматично при JSON.stringify(role).
     */
    toJSON() {
        const json = {}
        Object.entries(RoleSchema.columns).forEach(([prop, config]) => {
            // Додаємо в JSON лише ті поля, які не є прихованими
            if (!config.hidden) {
                json[prop] = this[prop]
            }
        })
        return json
    }
}

export default Role
