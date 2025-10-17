import oracledb from 'oracledb'
import fs from 'fs/promises'
import path from 'path'

// --- КОНФІГУРАЦІЯ ---
const DB_CONFIG = {
    user: 'YOUR_USER',
    password: 'YOUR_PASSWORD',
    connectString: 'HOST:PORT/SERVICE_NAME',
}

const ROOT_DIR = path.resolve('C:\\path\\to\\images')
const TABLE_NAME = 'IMAGES_TABLE'
const BATCH_SIZE = 100 // Кількість записів для вставки за одну транзакцію/виклик

oracledb.autoCommit = false // Вимикаємо авто-коміт, щоб керувати транзакцією вручну

/**
 * Головна функція для сканування та завантаження файлів.
 */
async function run() {
    let connection
    // Масив для збору всіх binds для пакетної вставки
    let bindsArray = []
    let filesProcessed = 0

    try {
        console.log('Підключення до бази даних...')
        connection = await oracledb.getConnection(DB_CONFIG)
        console.log('Успішно підключено.')

        // SQL-запит залишається іменованим, але виконуватиметься пакетно
        const sql = `
            INSERT INTO ${TABLE_NAME} (z_id, x_id, y_id, image)
            VALUES (:z_val, :x_val, :y_val, :image_val)
        `

        // ... (Логіка сканування файлової системи) ...
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

                        const image_data = await fs.readFile(full_path)

                        // Збираємо словник прив'язок
                        const bindItem = {
                            z_val: z_id,
                            x_val: x_id,
                            y_val: y_id,
                            image_val: image_data,
                        }

                        bindsArray.push(bindItem)
                        filesProcessed++

                        // ⭐️ Умова для пакетної вставки (Batching)
                        if (bindsArray.length >= BATCH_SIZE) {
                            console.log(
                                `\n📦 Виконання пакетної вставки ${bindsArray.length} файлів...`,
                            )

                            // ⭐️ Використовуємо executeMany
                            await connection.executeMany(sql, bindsArray)
                            await connection.commit() // Коміт пакету

                            console.log(
                                `   Успішно вставлено та закомічено ${bindsArray.length} рядків.`,
                            )

                            // Очищуємо масив для наступного пакету
                            bindsArray = []
                        }
                    }
                }
            }
        }

        // ⭐️ Обробка залишку (Last Batch)
        if (bindsArray.length > 0) {
            console.log(`\n📦 Виконання фінальної пакетної вставки ${bindsArray.length} файлів...`)
            await connection.executeMany(sql, bindsArray)
            await connection.commit()
            console.log(`   Успішно вставлено та закомічено ${bindsArray.length} рядків.`)
        }

        console.log(`\n✅ Завантаження завершено. Всього оброблено: ${filesProcessed} файлів.`)
    } catch (err) {
        console.error('\n❌ Виникла помилка:', err)
        // Відкат транзакції у випадку помилки
        if (connection) {
            await connection.rollback()
            console.log('Транзакція відкочена.')
        }
    } finally {
        // ... (Закриття з'єднання) ...
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
