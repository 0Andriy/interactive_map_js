// src/modules/users/entities/user.entity.js
export class User {
    constructor({ id, email, password, fullName, createdAt }) {
        this.id = id
        this.email = email
        this.password = password // Критичне поле, але потрібне для логіки (напр. валідації)
        this.fullName = fullName
        this.createdAt = createdAt
    }

    // Метод для безпечного повернення даних клієнту (без пароля)
    toResponse() {
        const { password, ...safeUser } = this
        return safeUser
    }

    // Бізнес-логіка всередині об'єкта (приклад)
    isEmailVerified() {
        return this.email.includes('@')
    }
}

