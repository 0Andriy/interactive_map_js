import config from '../../../config/config.js'
//
import oracleDbManager from '../../../db/OracleDbManager2.js'

export async function signup(username, password) {
    // Перевірка, чи існує користувач у базі даних
    const checkUserQuery = `SELECT COUNT(*) AS user_count FROM users WHERE username = :username`
    const result = await oracleDbManager.execute(checkUserQuery, { username: username })

    // Якщо користувач вже існує, кидаємо помилку
    if (result.rows[0][0] > 0) {
        throw new Error('User already exists') // Додаємо перевірку
    }

    // Хешування пароля
    const hashedPassword = await bcrypt.hash(password, 10)

    // Додавання нового користувача в базу даних
    const insertUserQuery = `
        INSERT INTO users (username, password)
        VALUES (:username, :password)
    `

    await oracleDbManager.execute(insertUserQuery, { username: username, password: hashedPassword })

    // Генерація токенів (access і refresh)

    return {
        tokens: {
            accessToken,
            refreshToken,
        },
    }
}

export async function login(username, password) {
    return null
}

export async function logout(refreshToken) {
    return null
}
