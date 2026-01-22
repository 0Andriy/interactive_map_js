import oracledb from 'oracledb'

export class Database {
    constructor(config) {
        this.config = config
    }

    async execute(sql, binds = [], opts = {}) {
        let conn
        try {
            conn = await oracledb.getConnection(this.config)
            return await conn.execute(sql, binds, { autoCommit: true, ...opts })
        } finally {
            if (conn) await conn.close()
        }
    }
}
