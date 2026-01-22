import oracledb from 'oracledb'

export class OracleDatabaseManager {
    constructor(logger) {
        this.logger = logger?.child?.({ component: 'OracleDatabaseManager' }) ?? logger
        this.databases = new Map()
    }

    async register(alias, config, isStandalone = false) {
        if (this.databases.has(alias)) return

        // Припускаємо, що OracleDatabaseService — це ваша обгортка над одним підключенням/пулом
        const dbService = {
            execute: async (sql, params = {}, options = {}) => {
                let conn
                try {
                    conn = await oracledb.getConnection(alias) // спрощений приклад
                    return await conn.execute(sql, params, {
                        outFormat: oracledb.OUT_FORMAT_OBJECT,
                        autoCommit: true,
                        ...options,
                    })
                } finally {
                    if (conn) await conn.close()
                }
            },
        }

        this.databases.set(alias, dbService)
    }

    db(alias) {
        const service = this.databases.get(alias)
        if (!service) throw new Error(`Database ${alias} not found`)
        return service
    }

    async closeAll() {
        for (const [alias, db] of this.databases) {
            await db.close?.()
        }
    }
}
