/**
 * @file Сервіс для управління бізнес-логікою користувачів.
 */
import CustomError from '../../../common/utils/CustomError.js'
import { User } from './user.model.js'

export class UserService {
    /**
     * @param {UserRepository} userRepository - Репозиторій користувачів
     * @param {object} logger - Екземпляр логера
     */
    constructor(userRepository, logger) {
        this.userRepository = userRepository
        this.logger = logger
    }

    /**
     * Отримання списку користувачів з обробкою метаданих пагінації
     */
    async getUsers(params) {
        this.logger?.debug?.('Fetching paginated users', params)

        const { items, total, page, limit } = await this.userRepository.findPaginated(params)

        // Розраховуємо додаткову інфу для фронтенда
        const totalPages = Math.ceil(total / limit)

        return {
            users: items, // Масив об'єктів класу User (toJSON автоматично очистить їх)
            meta: {
                total,
                page,
                limit,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1,
            },
        }
    }

    /**
     * Отримання одного користувача
     */
    async getUserById(id) {
        const user = await this.userRepository.findById(id)
        if (!user) {
            throw CustomError.NotFound(`Користувача з ID ${id} не знайдено`)
        }
        return user
    }

    /**
     * Створення нового користувача
     */
    async createUser(userData) {
        // 1. Перевірка на унікальність Email
        const existing = await this.userRepository.findByEmail(userData.email)
        if (existing) {
            throw CustomError.Conflict('Користувач з такою поштою вже зареєстрований')
        }

        // 2. Хешування пароля (приклад, якщо додасте bcrypt)
        // const hashedPassword = await bcrypt.hash(userData.password, 10);

        // 3. Створення екземпляра моделі
        const newUser = new User({
            ...userData,
            // password: hashedPassword,
            isActive: true,
        })

        this.logger?.info?.(`Створення нового користувача: ${newUser.email}`)

        // 4. Збереження через репозиторій
        const generatedId = await this.userRepository.create(newUser)

        // Повертаємо створений об'єкт (можна заново витягнути з бази для точності)
        return this.getUserById(generatedId)
    }

    /**
     * Повне оновлення профілю
     */
    async updateUser(id, updateData) {
        const user = await this.getUserById(id)

        // Якщо змінюється email — перевіряємо чи він не зайнятий іншим
        if (updateData.email && updateData.email !== user.email) {
            const emailTaken = await this.userRepository.findByEmail(updateData.email)
            if (emailTaken) throw CustomError.Conflict('Цей email вже використовується')
        }

        // Оновлюємо поля в моделі
        const updatedUser = new User({
            ...user,
            ...updateData,
            updatedAt: new Date(),
        })

        await this.userRepository.update(id, updatedUser)
        this.logger.info(`Користувача ID ${id} оновлено`)

        return updatedUser
    }

    /**
     * Блокування користувача (Soft block)
     */
    async toggleUserStatus(id, isActive) {
        const user = await this.getUserById(id)
        user.isActive = isActive

        await this.userRepository.update(id, user)
        this.logger.warn(`Статус користувача ${id} змінено на: ${isActive}`)

        return user
    }

    /**
     * Видалення користувача
     */
    async deleteUser(id) {
        await this.getUserById(id) // Перевірка існування
        await this.userRepository.delete(id)
        this.logger.warn(`Користувача ID ${id} видалено з системи`)
        return true
    }
}

// import CustomError from '../../../common/utils/CustomError.js'

// export class UserService {
//     constructor(userRepository, logger) {
//         this.userRepository = userRepository
//         this.logger = logger
//     }

//     async getAllUsers() {
//         return await this.userRepository.findAll()
//     }

//     async getUserById(id) {
//         const user = await this.userRepository.findById(id)
//         if (!user) throw CustomError.NotFound(`Користувача з ID ${id} не знайдено`)
//         return user
//     }

//     async createUser(dto) {
//         const existing = await this.userRepository.findByEmail(dto.email)
//         if (existing) throw CustomError.Conflict('Користувач з таким email вже існує')

//         this.logger.info(`Створення користувача в БД`, { email: dto.email })
//         return await this.userRepository.create(dto)
//     }

//     async updateUser(id, dto) {
//         await this.getUserById(id)
//         return await this.userRepository.update(id, dto)
//     }

//     async removeUser(id) {
//         await this.getUserById(id)
//         return await this.userRepository.delete(id)
//     }
// }
