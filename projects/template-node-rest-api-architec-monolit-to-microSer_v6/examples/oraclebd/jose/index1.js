/**
 * Перетворює сирі дані ключа у формат об'єкта jose.
 *
 * @param {Object|string} keySource - Об'єкт з ключами або сирий PEM рядок.
 * @param {string} alg - Алгоритм (напр. 'RS256').
 * @param {'sign'|'verify'} operation - Тип операції.
 * @returns {Promise<jose.KeyLike|Uint8Array>}
 */
export async function transformToJoseKey(keySource, alg, operation) {
    if (alg.startsWith('HS')) {
        const secret = keySource.secret || keySource
        return new TextEncoder().encode(secret)
    }

    if (operation === 'sign') {
        const privatePem = keySource.private_key || keySource
        return await jose.importPKCS8(privatePem, alg)
    } else {
        const publicPem = keySource.public_key || keySource
        return await jose.importSPKI(publicPem, alg)
    }
}

// /**
//  * Приклад реалізації Key Resolver для бази даних
//  */
// export const createDbKeyResolver = (dbConnection, serviceInstance) => {
//     return async (header, payload, operation = 'verify') => {
//         const cacheKey = `${operation}:${header.alg}:${header.kid}`

//         if (serviceInstance.cache.has(cacheKey)) {
//             return serviceInstance.cache.get(cacheKey)
//         }

//         // Запит до БД
//         const keyRecord = await dbConnection.keys.findUnique({
//             where: { kid: header.kid },
//         })

//         if (!keyRecord) throw new Error('Key not found in database')

//         let importedKey
//         if (header.alg.startsWith('HS')) {
//             importedKey = new TextEncoder().encode(keyRecord.secret)
//         } else {
//             importedKey =
//                 operation === 'sign'
//                     ? await jose.importPKCS8(keyRecord.private_key, header.alg)
//                     : await jose.importSPKI(keyRecord.public_key, header.alg)
//         }

//         serviceInstance.cache.set(cacheKey, importedKey)
//         return importedKey
//     }
// }

// --- ДОПОМІЖНІ ФУНКЦІЇ ТА СТРАТЕГІЇ ---

/**
 * Перетворює сирі дані ключа у формат jose.
 * @private
 */
async function transformToJoseKey(keyData, alg, operation) {
    if (alg.startsWith('HS')) {
        const secret = keySource.secret || keySource
        return new TextEncoder().encode(secret)
    }
    if (operation === 'sign') {
        const privatePem = keySource.private_key || keySource
        return await jose.importPKCS8(privatePem, alg)
    } else {
        const publicPem = keySource.public_key || keySource
        return await jose.importSPKI(publicPem, alg)
    }
}

/**
 * Огортає ресолвер логікою кешування.
 * @param {Function} resolver - Функція ресолвер.
 * @param {LRUCache} cacheInstance - Екземпляр кешу.
 */
export const withCache = (resolver, cacheInstance) => {
    return async (header, payload, operation) => {
        const cacheKey = `${operation}:${header.alg}:${header.kid}`
        if (cacheInstance.has(cacheKey)) return cacheInstance.get(cacheKey)

        const key = await resolver(header, payload, operation)
        cacheInstance.set(cacheKey, key)
        return key
    }
}

/**
 * Стратегія для бази даних.
 * @param {Object} dbConnection - Об'єкт підключення до БД.
 */
export const createDbKeyResolver = (dbConnection) => {
    return async (header, payload, operation) => {
        const keyRecord = await dbConnection.keys.findUnique({ where: { kid: header.kid } })
        if (!keyRecord) throw new Error(`Key ${header.kid} not found in DB`)
        return await transformToJoseKey(keyRecord, header.alg, operation)
    }
}

/**
 * Стратегія для Oracle Database
 * @param {Object} connection - Активне підключення або пул (node-oracledb)
 */
export const createOracleKeyResolver = (connection) => {
    return async (header, payload, operation) => {
        const sql = `
            SELECT secret, private_key, public_key, algorithm
            FROM app_keys
            WHERE kid = :kid AND is_active = 'Y'
        `

        // Виконуємо запит до Oracle
        const result = await connection.execute(sql, { kid: header.kid })

        if (!result.rows || result.rows.length === 0) {
            throw new Error(`Key ${header.kid} not found in Oracle DB`)
        }

        // В Oracle результат зазвичай приходить як масив або об'єкт (залежно від outFormat)
        const row = result.rows[0]

        // Передаємо дані в наш універсальний трансформер
        // (Він вже є у вашому файлі JwtService.js)
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

/**
 * Стратегія для файлової системи.
 * @param {string} basePath - Шлях до папки з ключами.
 */
export const createFileKeyResolver = (basePath) => {
    return async (header, payload, operation) => {
        const suffix = operation === 'sign' ? 'private' : 'public'
        const raw = await fs.readFile(`${basePath}/${header.kid}.${suffix}.pem`, 'utf8')
        return await transformToJoseKey(raw, header.alg, operation)
    }
}

// --- ПРИКЛАД ВИКОРИСТАННЯ (2026) ---
/*
const dbResolver = createDbKeyResolver(prisma);
const cachedResolver = withCache(dbResolver, new LRUCache({ max: 50 }));

const jwtService = new JwtService({
    keyResolver: cachedResolver,
    defaultOptions: {
        algorithm: 'RS256',
        clockSkewOffset: 30 // Завжди ставити iat на 30с назад
    }
});

const token = await jwtService.sign({ id: 1 }, { subject: 'user_login' });
*/
