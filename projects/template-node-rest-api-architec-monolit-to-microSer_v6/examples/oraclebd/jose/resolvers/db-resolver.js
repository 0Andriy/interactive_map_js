import { transformToJoseKey } from '../key-transformer.js'

export const createDbKeyResolver = (connection) => {
    return async (header, payload, operation) => {
        // Приклад для Oracle:
        const result = await connection.execute(
            `SELECT secret, private_key, public_key FROM keys_table WHERE kid = :kid`,
            { kid: header.kid },
            { outFormat: 4002 }, // Object format
        )

        const row = result.rows[0]
        if (!row) throw new Error('Ключ не знайдено в БД')

        return await transformToJoseKey(
            {
                secret: row.SECRET,
                private_key: row.PRIVATE_KEY,
                public_key: row.PUBLIC_KEY,
            },
            header.alg,
            operation,
        )
    }
}
