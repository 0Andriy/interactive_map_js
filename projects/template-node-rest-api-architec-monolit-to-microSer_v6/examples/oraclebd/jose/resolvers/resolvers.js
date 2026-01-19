import fs from 'node:fs/promises'
import { JwtService } from './JwtService.js'
import { LRUCache } from 'lru-cache'

/**
 * Ресолвер для роботи з Oracle Database.
 * @param {Object} connection - Активне підключення або пул драйвера oracledb.
 * @returns {Function} Асинхронна функція ресолвер.
 */
export const createOracleKeyResolver = (connection) => {
    return async (header, payload, operation) => {
        // Використовуємо Bind Variables (:kid) для захисту від SQL-ін'єкцій
        const sql = `
            SELECT secret, private_key, public_key
            FROM security_keys
            WHERE kid = :kid AND is_active = 1
        `

        const result = await connection.execute(
            sql,
            { kid: header.kid || 'default' },
            { outFormat: 4002 }, // oracledb.OUT_FORMAT_OBJECT
        )

        if (!result.rows || result.rows.length === 0) {
            throw new Error(`Ключ із KID '${header.kid}' не знайдено в Oracle`)
        }

        const row = result.rows[0]

        // Викликаємо статичний метод сервісу для трансформації
        return await JwtService.transformToJoseKey(
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
 * Ресолвер для читання ключів з файлової системи.
 * @param {string} certsDir - Шлях до директорії з PEM файлами.
 */
export const createFileKeyResolver = (certsDir) => {
    return async (header, payload, operation) => {
        const kid = header.kid || 'default'
        const isPrivate = operation === 'sign'

        // Формуємо ім'я файлу, наприклад: default.private.pem або default.public.pem
        const fileName = `${kid}.${isPrivate ? 'private' : 'public'}.pem`
        const filePath = path.join(certsDir, fileName)

        try {
            const rawKey = await fs.readFile(filePath, 'utf8')
            return await JwtService.transformToJoseKey(rawKey, header.alg, operation)
        } catch (error) {
            throw new Error(`Не вдалося прочитати файл ключа: ${filePath}. ${error.message}`)
        }
    }
}

/**
 * Ресолвер для ключів, що зберігаються в оперативній пам'яті.
 * @param {Object} keysMap - Об'єкт, де ключі — це KID, а значення — PEM-рядки або секрети.
 */
export const createStaticKeyResolver = (keysMap) => {
    return async (header, payload, operation) => {
        const kid = header.kid || 'default'
        const keyData = keysMap[kid]

        if (!keyData) {
            throw new Error(`Ключ із KID '${kid}' не знайдено в статичному сховищі`)
        }

        return await JwtService.transformToJoseKey(keyData, header.alg, operation)
    }
}

/**
 * Декоратор, що додає кешування до будь-якої стратегії ресолвера.
 * @param {Function} baseResolver - Основний ресолвер (Oracle, File тощо).
 * @param {Object} [cacheOptions] - Налаштування кешу.
 */
export const withCache = (baseResolver, cacheOptions = {}) => {
    const cache = new LRUCache({
        max: 100, // зберігати максимум 100 ключів
        ttl: 1000 * 60 * 10, // час життя 10 хвилин
        ...cacheOptions,
    })

    return async (header, payload, operation) => {
        const cacheKey = `${operation}:${header.alg}:${header.kid}`

        if (cache.has(cacheKey)) {
            return cache.get(cacheKey)
        }

        const key = await baseResolver(header, payload, operation)
        cache.set(cacheKey, key)

        return key
    }
}
