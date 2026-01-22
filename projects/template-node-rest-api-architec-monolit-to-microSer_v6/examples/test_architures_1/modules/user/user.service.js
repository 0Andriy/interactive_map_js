import bcrypt from 'bcrypt'
import { User } from './entities/user.entity.js'

export class UsersService {
    constructor(usersRepository, messageBroker) {
        this.usersRepository = usersRepository
        this.messageBroker = messageBroker
    }

    async register(dbAlias, dto) {
        const exists = await this.usersRepository.findByEmail(dbAlias, dto.email)
        if (exists) throw new Error('User already exists')

        const hashedPassword = await bcrypt.hash(dto.password, 10)

        // 1. Збереження в Oracle
        const user = await this.usersRepository.save(dbAlias, {
            ...dto,
            password: hashedPassword,
        })

        // 2. Отримання даних з іншого сервісу через HTTP
        // const balance = await this.billingClient.getUserBalance(user.id)

        // 3. Публікація події в Брокер
        await this.messageBroker.publish('user_events', 'user.created', {
            userId: user.id,
            email: user.email,
            fullName: user.fullName,
            timestamp: new Date().toISOString(),
        })

        return new User({ ...user, balance })
    }

    async getUser(email) {
        const user = await this.usersRepo.findByEmail(email)
        if (!user) throw new Error('Not found')

        // Тут ми вже маємо доступ до методів класу User
        console.log(user.email)
        return user
    }

    async handleUserCreated(user) {
        await this.messageBroker.publish('user_events', 'user.created', { id: user.id })
    }
}
