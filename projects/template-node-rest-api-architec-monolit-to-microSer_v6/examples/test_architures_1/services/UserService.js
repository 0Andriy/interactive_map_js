// src/services/UserService.js
import { UserDTO } from '../core/dto/UserDTO.js'

export class UserService {
    /**
     * @param {Object} userRepo - Інтерфейс репозиторію (DI)
     */
    constructor(userRepo) {
        this.userRepo = userRepo
    }

    async findUser(id) {
        const user = await this.userRepo.getById(id)
        if (!user) throw new Error(`User with ID ${id} not found`)
        return UserDTO.toResponse(user)
    }

    async listUsers(filter) {
        const users = await this.userRepo.getAll(filter?.limit)
        return users.map(UserDTO.toResponse)
    }

    async registerUser(data) {
        // Тут могла б бути валідація або хешування пароля
        const newId = await this.userRepo.create(data)
        return { success: true, id: newId }
    }

    async removeUser(id) {
        await this.userRepo.delete(id)
        return { success: true }
    }
}
