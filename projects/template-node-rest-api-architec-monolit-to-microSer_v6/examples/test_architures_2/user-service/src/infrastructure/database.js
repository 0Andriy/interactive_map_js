// src/infrastructure/database.js
import oracledb from 'oracledb'

export class Database {
    constructor(config) {
        this.config = config
    }

    async execute(sql, binds = [], opts = {}) {
        let conn
        try {
            conn = await oracledb.getConnection(this.config)
            // fetchAsString дозволяє коректно отримувати ID та дати
            return await conn.execute(sql, binds, {
                autoCommit: true,
                outFormat: oracledb.OUT_FORMAT_OBJECT,
                ...opts,
            })
        } finally {
            if (conn) await conn.close()
        }
    }
}
