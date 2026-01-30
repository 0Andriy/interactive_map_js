// user.service.js
import bcrypt from 'bcrypt'
import User from './user.model.js'

/**
 * Сервіс для управління користувачами.
 * Демонструє взаємодію з іншим модулем через RoleService.
 */
class UserService {
    /**
     * @param {UserRepository} userRepository
     * @param {RoleService} roleService - Сервіс з іншого модуля (DI)
     */
    constructor(userRepository, roleService) {
        this.userRepository = userRepository
        this.roleService = roleService
    }

    /**
     * Створення користувача з перевіркою ролей
     */
    async createUser(userData, roleIds = []) {
        // 1. Бізнес-валідація: перевіряємо чи існують всі вказані ролі
        // Використовуємо метод roleService, який ми вже реалізували раніше
        if (roleIds.length > 0) {
            await Promise.all(roleIds.map((id) => this.roleService.getRoleById(id)))
        }
        // // Використовуємо один чистий виклик замість Promise.all
        // await this.roleService.validateRolesExist(roleIds)

        // 2. Хешування пароля (приклад бізнес-логіки)
        // Хешування пароля перед збереженням
        const saltRounds = 10
        const hashedPassword = await bcrypt.hash(data.password, saltRounds)

        const newUser = new User({
            ...userData,
            password: hashedPassword,
            isActive: 1, // За замовчуванням активний
        })

        // 3. Збереження через репозиторій
        return await this.userRepository.create(newUser, roleIds)
    }

    async getUser(id) {
        const user = await this.userRepository.findById(id)
        if (!user) {
            throw new Error(`User with ID ${id} not found`)
        }
        return user
    }

    async getUserByUsername(username) {
        const user = await this.userRepo.findByUsername(username)
        if (!user) {
            throw new Error(`Користувача з логіном ${username} не знайдено`)
        }
        return user
    }

    async updateUser(id, updateData) {
        // 1. Перевірка чи існує користувач
        const existingUser = await this.getUser(id)

        // 2. Якщо змінюється email — можна додати перевірку на дублікат у БД
        if (updateData.email && updateData.email !== existingUser.email) {
            // Тут логіка перевірки унікальності
        }

        // 3. Виконуємо часткове оновлення в репозиторії
        const success = await this.userRepository.update(id, updateData)

        if (!success) {
            throw new Error(`Не вдалося оновити користувача з ID ${id}`)
        }

        // Повертаємо оновлений об'єкт
        return await this.getUser(id)
    }

    async deleteUser(id) {
        // Перевірка існування перед видаленням
        await this.getUser(id)
        return await this.userRepository.delete(id)
    }

    /**
     * Додатковий метод для оновлення ролей користувача
     */
    async updateUserRoles(userId, newRoleIds) {
        await this.getUser(userId)

        // Перевірка нових ролей
        await Promise.all(newRoleIds.map((id) => this.roleService.getRoleById(id)))

        // Логіка оновлення зв'язків у репозиторії
        return await this.userRepository.syncRoles(userId, newRoleIds)
    }
}

export default UserService
