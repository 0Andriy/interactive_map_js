// src/modules/user/user.service.js
export class UserService {
    constructor(db) {
        this.db = db
    }

    async getByEmail(email) {
        const sql = `SELECT id, email, password_hash as "passwordHash", full_name as "fullName"
                 FROM users WHERE email = :email`
        const result = await this.db.execute(sql, [email])
        return result.rows[0] || null
    }

    async getById(id) {
        const sql = `SELECT id, email, full_name as "fullName" FROM users WHERE id = :id`
        const result = await this.db.execute(sql, [id])
        return result.rows[0] || null
    }

    async create(userData) {
        const sql = `INSERT INTO users (email, password_hash, full_name)
                 VALUES (:email, :password, :name) RETURNING id INTO :id`
        // Логіка створення з поверненням ID
        const result = await this.db.execute(sql, {
            email: userData.email,
            password: userData.password, // У реальному проекті тут вже хеш
            name: userData.fullName,
            id: { type: 2002, dir: 3003 }, // Oracle binding для OUT параметра
        })
        return { id: result.outBinds.id[0], ...userData }
    }
}

// src/modules/user/user.service.js
export class UserService {
    constructor(userRepository) {
        this.userRepository = userRepository // Інжектуємо репозиторій
    }

    async getProfile(email) {
        const user = await this.userRepository.findByEmail(email)
        if (!user) throw new Error('User not found')

        // Бізнес-логіка (наприклад, фільтрація даних)
        return user
    }
}
