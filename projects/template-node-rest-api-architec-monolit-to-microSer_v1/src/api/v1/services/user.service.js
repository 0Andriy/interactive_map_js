import db from '../../../config/db.js' // Припустимо, у вас є конфігурація для oracledb
import bcrypt from 'bcryptjs'
import { mapKeysToCamelCase } from '../../../utils/objectUtils.js' // Допоміжна функція для перетворення ключів

// Допоміжна функція для перетворення полів з Oracle (UPPER_CASE) в camelCase
// її потрібно створити в src/utils/objectUtils.js
/*
export const mapKeysToCamelCase = (obj) => {
  if (Array.isArray(obj)) {
    return obj.map(v => mapKeysToCamelCase(v));
  } else if (obj !== null && obj.constructor === Object) {
    return Object.keys(obj).reduce((result, key) => {
      const camelCaseKey = key.toLowerCase().replace(/_([a-z])/g, g => g[1].toUpperCase());
      result[camelCaseKey] = obj[key];
      return result;
    }, {});
  }
  return obj;
};
*/

/**
 * Пошук користувача за ID
 * @param {number} userId - ID користувача
 * @returns {Promise<object|null>} Об'єкт користувача або null
 */
export async function findUserById(userId) {
    const query = `
    SELECT USER_ID, USERNAME, EMAIL, FIRST_NAME, LAST_NAME, IS_ACTIVE, IS_EMAIL_VERIFIED, CREATED_AT, UPDATED_AT, LAST_LOGIN_AT
    FROM USERS
    WHERE USER_ID = :userId AND DELETED_AT IS NULL
  `
    const result = await db.execute(query, { userId })
    if (result.rows.length === 0) {
        return null
    }
    return mapKeysToCamelCase(result.rows[0])
}

/**
 * Отримання списку всіх користувачів з пагінацією
 * @param {number} page - Номер сторінки
 * @param {number} limit - Кількість елементів на сторінці
 * @returns {Promise<Array>} Масив користувачів
 */
export async function findAllUsers({ page = 1, limit = 10 }) {
    const offset = (page - 1) * limit
    const query = `
    SELECT USER_ID, USERNAME, EMAIL, FIRST_NAME, LAST_NAME, IS_ACTIVE, CREATED_AT
    FROM USERS
    WHERE DELETED_AT IS NULL
    ORDER BY CREATED_AT DESC
    OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
  `
    const result = await db.execute(query, { offset, limit })
    return mapKeysToCamelCase(result.rows)
}

/**
 * Оновлення даних користувача
 * @param {number} userId - ID користувача
 * @param {object} userData - Дані для оновлення
 * @returns {Promise<object|null>} Оновлений об'єкт користувача
 */
export async function updateUser(userId, userData) {
    const { firstName, lastName, email, isActive } = userData

    // Формуємо запит динамічно
    const fields = []
    const params = { userId }

    if (firstName !== undefined) {
        fields.push('FIRST_NAME = :firstName')
        params.firstName = firstName
    }
    if (lastName !== undefined) {
        fields.push('LAST_NAME = :lastName')
        params.lastName = lastName
    }
    if (email !== undefined) {
        fields.push('EMAIL = :email')
        params.email = email
    }
    if (isActive !== undefined) {
        fields.push('IS_ACTIVE = :isActive')
        params.isActive = isActive ? 1 : 0
    }

    if (fields.length === 0) {
        return findUserById(userId) // Повертаємо поточні дані, якщо нічого оновлювати
    }

    fields.push('UPDATED_AT = SYSTIMESTAMP')

    const query = `
    UPDATE USERS
    SET ${fields.join(', ')}
    WHERE USER_ID = :userId
    RETURNING USER_ID, USERNAME, EMAIL, FIRST_NAME, LAST_NAME, IS_ACTIVE INTO :uid, :uname, :email, :fname, :lname, :is_active
  `

    const result = await db.execute(query, params, { autoCommit: true })

    if (result.rowsAffected === 0) {
        return null
    }

    // Повертаємо оновлені дані
    return findUserById(userId)
}

/**
 * М'яке видалення користувача (встановлення DELETED_AT)
 * @param {number} userId - ID користувача
 * @returns {Promise<boolean>} true, якщо видалення успішне
 */
export async function softDeleteUser(userId) {
    const query = `
    UPDATE USERS
    SET DELETED_AT = SYSTIMESTAMP, IS_ACTIVE = 0
    WHERE USER_ID = :userId AND DELETED_AT IS NULL
  `
    const result = await db.execute(query, { userId }, { autoCommit: true })
    return result.rowsAffected > 0
}

/**
 * Призначення ролі користувачеві
 * @param {number} userId - ID користувача
 * @param {string} roleName - Назва ролі
 * @returns {Promise<object>}
 */
export async function assignRoleToUser(userId, roleName) {
    // 1. Знайти ID ролі за її назвою
    const roleQuery = `SELECT ROLE_ID FROM ROLES WHERE ROLE_NAME = :roleName`
    const roleResult = await db.execute(roleQuery, { roleName })

    if (roleResult.rows.length === 0) {
        throw new Error(`Role '${roleName}' not found.`)
    }
    const roleId = roleResult.rows[0].ROLE_ID

    // 2. Призначити роль користувачеві
    const assignQuery = `
        INSERT INTO USER_ROLES (USER_ID, ROLE_ID)
        VALUES (:userId, :roleId)
    `
    await db.execute(assignQuery, { userId, roleId }, { autoCommit: true })

    return { success: true, message: `Role '${roleName}' assigned to user ${userId}.` }
}

import db from '../../../config/db.js' // Ваш модуль для з'єднання з БД
import { mapKeysToCamelCase } from '../../../utils/objectUtils.js' // Допоміжна функція

/**
 * Перетворює результат від oracledb (масив масивів) на масив об'єктів.
 * @param {object} result - Результат від oracledb.
 * @returns {Array<object>} Масив об'єктів.
 */
function toObjectArray(result) {
    if (!result || !result.rows || result.rows.length === 0) {
        return []
    }
    const objects = result.rows.map((row) => {
        const obj = {}
        result.metaData.forEach((meta, index) => {
            obj[meta.name] = row[index]
        })
        return obj
    })
    return mapKeysToCamelCase(objects)
}

class UserGateway {
    /**
     * Пошук користувача за ID.
     * @param {string} dbName - Назва БД.
     * @param {number} id - ID користувача.
     * @param {boolean} includePassword - Чи включати хеш пароля.
     * @returns {Promise<object|null>} Об'єкт користувача.
     */
    async findById(dbName, id, includePassword = false) {
        const columns =
            'u.USER_ID, u.USERNAME, u.EMAIL, u.FIRST_NAME, u.LAST_NAME, u.IS_ACTIVE, u.IS_EMAIL_VERIFIED, u.CREATED_AT, u.UPDATED_AT, u.LAST_LOGIN_AT, u.DELETED_AT' +
            (includePassword ? ', u.PASSWORD_HASH' : '')

        const query = `
            SELECT ${columns},
                   (SELECT LISTAGG(r.ROLE_NAME, ',') WITHIN GROUP (ORDER BY r.ROLE_NAME)
                    FROM USER_ROLES ur
                    JOIN ROLES r ON ur.ROLE_ID = r.ROLE_ID
                    WHERE ur.USER_ID = u.USER_ID) as ROLES
            FROM USERS u
            WHERE u.USER_ID = :id AND u.DELETED_AT IS NULL
        `
        const result = await db.execute(dbName, query, { id })
        if (result.rows.length === 0) return null

        const user = toObjectArray(result)[0]
        if (user.roles) {
            user.roles = user.roles.split(',')
        } else {
            user.roles = []
        }
        return user
    }

    /**
     * Отримання списку всіх користувачів з пагінацією.
     * @param {string} dbName - Назва БД.
     * @param {object} options - Опції пагінації { page, limit }.
     * @returns {Promise<Array<object>>} Масив користувачів.
     */
    async findAll(dbName, { page = 1, limit = 10 }) {
        const offset = (page - 1) * limit
        const query = `
            SELECT USER_ID, USERNAME, EMAIL, FIRST_NAME, LAST_NAME, IS_ACTIVE, CREATED_AT
            FROM USERS
            WHERE DELETED_AT IS NULL
            ORDER BY CREATED_AT DESC
            OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
        `
        const result = await db.execute(dbName, query, { offset, limit })
        return toObjectArray(result)
    }

    /**
     * Оновлення даних користувача.
     * @param {string} dbName - Назва БД.
     * @param {number} id - ID користувача.
     * @param {object} userData - Дані для оновлення.
     * @returns {Promise<object|null>} Оновлений об'єкт користувача.
     */
    async update(dbName, id, userData) {
        const fields = []
        const params = { id, ...userData }

        // Мапуємо camelCase на SNAKE_CASE для полів БД
        const fieldMapping = {
            firstName: 'FIRST_NAME',
            lastName: 'LAST_NAME',
            email: 'EMAIL',
            isActive: 'IS_ACTIVE',
            passwordHash: 'PASSWORD_HASH',
            lastLoginAt: 'LAST_LOGIN_AT',
        }

        for (const key in userData) {
            if (fieldMapping[key]) {
                fields.push(`${fieldMapping[key]} = :${key}`)
            }
        }

        if (fields.length === 0) {
            return this.findById(dbName, id)
        }

        fields.push('UPDATED_AT = SYSTIMESTAMP')

        const query = `
            UPDATE USERS
            SET ${fields.join(', ')}
            WHERE USER_ID = :id
        `

        const result = await db.execute(dbName, query, params, { autoCommit: true })
        if (result.rowsAffected === 0) return null

        return this.findById(dbName, id)
    }

    /**
     * М'яке видалення користувача.
     * @param {string} dbName - Назва БД.
     * @param {number} id - ID користувача.
     * @returns {Promise<boolean>}
     */
    async softDelete(dbName, id) {
        const query = `
            UPDATE USERS
            SET DELETED_AT = SYSTIMESTAMP, IS_ACTIVE = 0
            WHERE USER_ID = :id AND DELETED_AT IS NULL
        `
        const result = await db.execute(dbName, query, { id }, { autoCommit: true })
        return result.rowsAffected > 0
    }

    /**
     * Пошук ролі за назвою.
     * @param {string} dbName - Назва БД.
     * @param {string} roleName - Назва ролі.
     * @returns {Promise<object|null>} Об'єкт ролі.
     */
    async findRoleByName(dbName, roleName) {
        const query = `SELECT ROLE_ID, ROLE_NAME FROM ROLES WHERE ROLE_NAME = :roleName`
        const result = await db.execute(dbName, query, { roleName })
        if (result.rows.length === 0) return null
        return toObjectArray(result)[0]
    }

    /**
     * Призначення ролі користувачеві.
     * @param {string} dbName - Назва БД.
     * @param {number} userId - ID користувача.
     * @param {number} roleId - ID ролі.
     * @returns {Promise<boolean>}
     */
    async assignRole(dbName, userId, roleId) {
        const query = `
            INSERT INTO USER_ROLES (USER_ID, ROLE_ID)
            VALUES (:userId, :roleId)
        `
        try {
            const result = await db.execute(dbName, query, { userId, roleId }, { autoCommit: true })
            return result.rowsAffected > 0
        } catch (error) {
            // Обробка помилки унікальності (якщо роль вже призначена)
            if (error.errorNum && error.errorNum === 1) {
                // ORA-00001: unique constraint violated
                return false // Роль вже існує
            }
            throw error // Інші помилки
        }
    }
}

export default new UserGateway()
