import { RoleSchema } from './role.schema.js'

/**
 * Клас Role (Domain Entity).
 * Забезпечує роботу з даними без прямої прив'язки до назв колонок БД.
 */
export class Role {
    /**
     * @param {Object.<string, any>} [attributes={}] - Початкові атрибути сутності
     */
    constructor(data = {}) {
        const properties = Object.keys(RoleSchema.columns)
        for (const property of properties) {
            this[property] = data[property]
        }
    }

    /**
     * Створює екземпляр Role з сирого результату запиту Oracle (Row до Object).
     * @param {Object.<string, any>} record - Рядок з бази даних (наприклад, { ROLE_ID: 1, ROLE_NAME: 'Admin' })
     * @returns {Role}
     */
    static fromDatabase(row) {
        const data = {}
        const entries = Object.entries(RoleSchema.columns)
        for (const [prop, config] of entries) {
            data[prop] = row[config.name]
        }
        return new Role(data)
    }

    /**
     * Трансформує сутність у формат колонок БД для SQL-запитів (Object до Row).
     * @returns {Object.<string, any>} Об'єкт з ключами-назвами колонок
     */
    toDatabaseNames() {
        const dbRow = {}
        const entries = Object.entries(RoleSchema.columns)
        for (const [prop, config] of entries) {
            if (this[prop] !== undefined) {
                dbRow[config.name] = this[prop]
            }
        }
        return dbRow
    }

    /**
     * Очищує об'єкт від системних/прихованих полів для відправки клієнту.
     * Метод для серіалізації в JSON.
     * Викликається автоматично при JSON.stringify(role).
     * @returns {Object.<string, any>}
     */
    toJSON() {
        const json = {}
        const entries = Object.entries(RoleSchema.columns)
        for (const [prop, config] of entries) {
            if (!config.hidden) {
                json[prop] = this[prop]
            }
        }
        return json
    }
}
