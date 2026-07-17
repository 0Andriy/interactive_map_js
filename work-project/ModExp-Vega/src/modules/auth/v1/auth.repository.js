import { getContext } from '../../../common/utils/context.js'

export class AuthRepository {
    /**
     * @param {Object} dbManager - Менеджер динамічних підключень до Oracle (Multi-Tenant)
     */
    constructor(dbManager) {
        this.dbManager = dbManager
    }

    /**
     * Отримує екзекутор БД на основі поточного контексту запиту
     * @private
     */
    async _getExecutor(overrideDbName = null) {
        // 1. Перевіряємо, чи ініціалізовано dbManager у класі
        if (!this.dbManager || typeof this.dbManager.get !== 'function') {
            throw new Error('Database manager is not initialized or missing "get" method')
        }

        const context = getContext() || {}
        const dbName = overrideDbName || context.dbName

        // 2. Перевіряємо наявність імені бази даних
        if (!dbName) {
            throw new Error('Database context (dbName) is missing')
        }

        // 3. Отримуємо екзекутор
        const executor = await this.dbManager.get(dbName)

        // 4. Перевіряємо, чи вдалося знайти екзекутор для цієї БД
        if (!executor) {
            throw new Error(`Database executor not found for database: "${dbName}"`)
        }

        return executor
    }

    /**
     * Валідація нативного користувача СУБД Oracle через збережену функцію в пакеті
     */
    async verifyOracleDbUser(userLogin, password, internalCtx = {}) {
        const dbService = await this._getExecutor()

        const sql = `
            DECLARE
                v_bool BOOLEAN;
            BEGIN
                -- Викликаємо функцію
                v_bool := sandbox_apex.AUTHTO10_PKG.db10_authentication(:userLogin, :password);

                -- Конвертуємо BOOLEAN у NUMBER для Node.js
                IF v_bool THEN
                    :result := 1;
                ELSE
                    :result := 0;
                END IF;
            END;
        `

        const bindVars = {
            userLogin,
            password,
            // Динамічний доступ до констант типів dbService
            result: {
                type: dbService.oracledb.NUMBER,
                dir: dbService.oracledb.BIND_OUT,
            },
        }

        const result = await dbService.execute(sql, bindVars, {}, internalCtx)
        const functionResult = result.outBinds?.result

        return functionResult === 1
    }
}
