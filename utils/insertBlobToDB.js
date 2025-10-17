import oracledb from 'oracledb'
import fs from 'fs/promises'
import path from 'path'

// --- КОНФІГУРАЦІЯ (залишається без змін) ---
const DB_CONFIG = {
    user: 'YOUR_USER',
    password: 'YOUR_PASSWORD',
    connectString: 'HOST:PORT/SERVICE_NAME',
}

const ROOT_DIR = path.resolve('C:\\path\\to\\images')
const TABLE_NAME = 'IMAGES_TABLE'

oracledb.autoCommit = true

/**
 * Головна функція для сканування та завантаження файлів.
 */
async function run() {
    let connection

    try {
        console.log('Підключення до бази даних...')
        connection = await oracledb.getConnection(DB_CONFIG)
        console.log('Успішно підключено.')

        // ... (Логіка сканування файлової системи залишається без змін) ...

        const z_dirs = await fs.readdir(ROOT_DIR, { withFileTypes: true })

        for (const z_dirent of z_dirs) {
            if (!z_dirent.isDirectory()) continue
            const z_id = z_dirent.name
            const z_path = path.join(ROOT_DIR, z_id)

            const x_dirs = await fs.readdir(z_path, { withFileTypes: true })

            for (const x_dirent of x_dirs) {
                if (!x_dirent.isDirectory()) continue
                const x_id = x_dirent.name
                const x_path = path.join(z_path, x_id)

                const files = await fs.readdir(x_path)

                for (const filename of files) {
                    if (path.extname(filename).toLowerCase() === '.png') {
                        const full_path = path.join(x_path, filename)
                        const y_id = path.parse(filename).name

                        console.log(`\n -> Обробка файлу: ${full_path}`)

                        const image_data = await fs.readFile(full_path)

                        // 1. Використовуємо іменовані параметри в SQL-запиті (:z_val, :x_val, ...)
                        const sql = `
                            INSERT INTO ${TABLE_NAME} (z_id, x_id, y_id, image)
                            VALUES (:z_val, :x_val, :y_val, :image_val)
                        `

                        // 2. Створюємо словник (об'єкт) для прив'язки параметрів
                        const binds = {
                            z_val: z_id,
                            x_val: x_id,
                            y_val: y_id,
                            image_val: image_data, // BLOB дані
                        }

                        // 3. Передаємо словник у connection.execute()
                        const result = await connection.execute(sql, binds)

                        console.log(`   Успішно вставлено ${result.rowsAffected} рядок.`)
                    }
                }
            }
        }

        console.log('\n✅ Завантаження завершено.')
    } catch (err) {
        console.error('\n❌ Виникла помилка:', err)
    } finally {
        if (connection) {
            try {
                await connection.close()
                console.log("З'єднання закрито.")
            } catch (err) {
                console.error("Помилка при закритті з'єднання:", err)
            }
        }
    }
}

run()
