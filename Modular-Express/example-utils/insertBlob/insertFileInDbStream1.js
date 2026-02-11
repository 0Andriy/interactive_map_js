import fs from 'node:fs'
import crypto from 'node:crypto'

/**
 * Универсальная загрузка файла в Oracle BLOB с расчетом хеша
 * @param {Object} db - Ваш об'єкт бази даних
 * @param {string} filePath - Повний шлях до файлу на диску
 * @param {string} fileName - Назва файлу для запису в БД
 */
export const uploadFile_v1 = async (db, filePath, fileName) => {
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
            INSERT INTO ZZ_FILE_STORAGE (ID, NAME, CONTENT)
            VALUES (1, :name, EMPTY_BLOB())
            RETURNING ID, CONTENT INTO :id, :lobbv`

            const paramsInsert = {
                name: fileName,
                id: { type: db.oracledb.NUMBER, dir: db.oracledb.BIND_OUT },
                lobbv: { type: db.oracledb.BLOB, dir: db.oracledb.BIND_OUT },
            }

            const resultInsert = await ctx.execute(sqlInsert, paramsInsert)
            const outBinds = resultInsert.outBinds

            const recordId = Array.isArray(outBinds.id) ? outBinds.id[0] : outBinds.id
            lob = Array.isArray(outBinds.lobbv) ? outBinds.lobbv[0] : outBinds.lobbv

            if (!lob) throw new Error('Failed to initialize LOB locator')

            const sourceStream = fs.createReadStream(filePath)

            // 2. Стрімимо файл безпосередньо в Oracle + рахуємо хеш
            await new Promise((resolve, reject) => {
                // Рахуємо хеш під час читання файлу
                sourceStream.on('data', (chunk) => {
                    hash.update(chunk)
                })

                sourceStream.on('error', (err) => {
                    // Важливо: знищуємо LOB стрім при помилці файлу
                    lob.destroy()
                    reject(err)
                })

                lob.on('error', reject)

                // finish означає, що дані записані в стрім драйвера
                lob.on('finish', resolve)

                // Запускаємо передачу файла в базу
                sourceStream.pipe(lob)
            })

            // 3. Оновлюємо хеш у тому самому рядку (це запустить триггер, якщо є)
            const finalHash = hash.digest('hex')

            const sqlUpdate = `UPDATE ZZ_FILE_STORAGE SET HASH_VALUE = :hash WHERE ID = :id`
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

// -----------------------------

// create table ZZ_FILE_STORAGE
// (
//     id          NUMBER,
//     name        VARCHAR2(255) not null,
//     content     BLOB,
//     hash_value  VARCHAR2(100),
//     upload_date TIMESTAMP(6) default CURRENT_TIMESTAMP
// )

// import { OracleDatabaseManager } from '../../src/common/db/oracle/OracleDatabaseManager.js'
// import config from '../../src/config/config.js'

// import { fileURLToPath } from 'url'
// import path from 'path'

// // 1. Отримуємо шлях до поточного файлу
// const __filename = fileURLToPath(import.meta.url);

// // 2. Отримуємо шлях до поточної директорії
// const __dirname = path.dirname(__filename);

// //
// const dbManager = new OracleDatabaseManager()
// // Реєструємо бази даних
// await dbManager.register('TEST', config.oracleDB.connections['TEST'], {
//     thickModeOptions: config.oracleDB.thickModeOptions,
// })

// const db = dbManager.get('TEST')

// const isHealthy = await db.isHealthy()
// console.log(1, isHealthy)

// const fileUrl = path.join(__dirname, 'oraociei11.dll')

// const resultInsert = await uploadFile_v1(db, fileUrl, path.basename(fileUrl))
// console.log(2, resultInsert)
