import fs from 'node:fs'
import crypto from 'node:crypto'

/**
 * Универсальная загрузка файла в Oracle BLOB с расчетом хеша
 * @param {Object} db - Ваш об'єкт бази даних
 * @param {string} filePath - Повний шлях до файлу на диску
 * @param {string} fileName - Назва файлу для запису в БД
 */
export const uploadFile = async (db, filePath, fileName) => {
    // 0. Предварительная проверка
    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`)
    }

    const result = await db.withTransaction(async (ctx) => {
        let lob = null

        try {
            const hash = crypto.createHash('sha256')

            // 1. Створюємо запис і отримуємо вказівник на LOB (локатор)
            const sqlInsert = `
            INSERT INTO MY_TABLE (FILE_NAME, FILE_DATA)
            VALUES (:name, EMPTY_BLOB())
            RETURNING ID, FILE_DATA INTO :id, :lobbv`

            const paramsInsert = {
                name: fileName,
                id: { type: db.oracledb.NUMBER, dir: db.oracledb.BIND_OUT },
                lobbv: { type: db.oracledb.BLOB, dir: db.oracledb.BIND_OUT },
            }

            const resultInsert = await ctx.uploadBlob(sqlInsert, paramsInsert)
            const outBinds = resultInsert.outBinds

            const recordId = Array.isArray(outBinds.id) ? outBinds.id[0] : outBinds.id
            lob = Array.isArray(outBinds.lobbv) ? outBinds.lobbv[0] : outBinds.lobbv

            if (!lob) throw new Error('Failed to initialize LOB locator')

            const fileStream = fs.createReadStream(filePath)

            // 2. Стрімимо файл безпосередньо в Oracle + рахуємо хеш
            await new Promise((resolve, reject) => {
                // Рахуємо хеш під час читання файлу
                fileStream.on('data', (chunk) => {
                    hash.update(chunk)
                })

                fileStream.on('error', (err) => {
                    // Важливо: знищуємо LOB стрім при помилці файлу
                    lob.destroy()
                    reject(err)
                })

                lob.on('error', reject)

                // finish означає, що дані записані в стрім драйвера
                lob.on('finish', resolve)

                // Запускаємо передачу файла в базу
                fileStream.pipe(lob)
            })

            // 3. Оновлюємо хеш у тому самому рядку (це запустить триггер, якщо є)
            const finalHash = hash.digest('hex')

            const sqlUpdate = `UPDATE MY_TABLE SET FILE_HASH = :hash WHERE ID = :id`
            const paramsUpdate = {
                hash: finalHash,
                id: recordId,
            }

            await ctx.execute(sqlUpdate, paramsUpdate)

            return recordId
        } catch (error) {
            if (lob && typeof lob.destroy === 'function') {
                lob.destroy()
            }
            // У разі помилки на етапі стрімінгу — кидаємо її далі,
            // щоб withTransaction міг зробити rollback
            throw error
        }
    })

    return result
}
