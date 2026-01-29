import { Role } from './role.model.js'

/**
 * Сервіс для управління ролями користувачів.
 * Обробляє бізнес-правила та валідацію.
 */
export class RoleService {
    /**
     * @param {import('./role.repository.js').RoleRepository} roleRepository
     */
    constructor(roleRepository) {
        this.roleRepository = roleRepository
    }

    /**
     * Отримує всі доступні ролі.
     * @returns {Promise<Role[]>}
     */
    async getAllRoles() {
        try {
            return await this.roleRepository.find()
        } catch (error) {
            throw new Error(`Failed to fetch roles: ${error.message}`)
        }
    }

    /**
     * Знайти роль за ID або кинути помилку.
     * @param {number|string} id
     * @returns {Promise<Role>}
     * @throws {Error} Якщо роль не знайдено або ID некоректний.
     */
    async getRoleById(id) {
        if (!id || isNaN(id)) throw new Error('Invalid Role ID')

        const role = await this.roleRepository.findById(id)
        if (!role) throw new Error(`Role with ID ${id} not found`)

        return role
    }

    /**
     * Створює нову роль з попередньою валідацією.
     * @param {Object} roleData
     * @param {string} roleData.name - Назва ролі.
     * @param {string} [roleData.description] - Опис.
     * @returns {Promise<Role>}
     */
    async createRole(roleData) {
        if (!roleData.name) throw new Error('Role name is required')

        // Нормалізація для консистентності в БД
        const normalizedName = roleData.name.toUpperCase().trim()

        // Перевірка на дублікат імені (Business Rule)
        const existing = await this.roleRepository.findByName(normalizedName)
        if (existing) throw new Error(`Role "${normalizedName}" already exists`)

        // const existing = await this.roleRepository.find({ name: normalizedName })
        // if (existing.length > 0) {
        //     throw new Error(`Роль з назвою "${normalizedName}" вже існує`)
        // }

        const newRole = new Role({ ...roleData, name: normalizedName })
        return await this.roleRepository.create(newRole)
    }

    /**
     * Оновлює дані існуючої ролі.
     * @param {number|string} id
     * @param {Object} roleData
     * @returns {Promise<Role>}
     */
    async updateRole(id, roleData) {
        // Перевіряємо чи існує роль перед оновленням
        await this.getRoleById(id)

        const updatePayload = { ...roleData }

        if (updatePayload.name) {
            updatePayload.name = updatePayload.name.toUpperCase().trim()
        }

        const success = await this.roleRepository.update(id, updatePayload)
        if (!success) throw new Error('Update failed')

        return await this.getRoleById(id)
    }

    /**
     * Видаляє роль, якщо вона не є системною.
     * @param {number|string} id
     * @returns {Promise<{success: boolean, deletedId: number|string}>}
     */
    async deleteRole(id) {
        const role = await this.getRoleById(id)

        // Бізнес-правило: Заборона видалення критичних ролей
        if (role.name === 'ADMIN') {
            throw new Error('System role "ADMIN" cannot be deleted')
        }

        const success = await this.roleRepository.delete(id)
        if (!success) throw new Error(`Could not delete role ${id}`)

        return { success: true, deletedId: id }
    }

    /**
     * Масова перевірка наявності ролей у базі.
     * Корисно при створенні користувача з декількома ролями.
     * @param {Array<number|string>} roleIds
     * @throws {Error} Якщо хоча б одна роль відсутня.
     */
    async validateRolesExist(roleIds) {
        if (!roleIds || roleIds.length === 0) return

        // Викликаємо репозиторій для перевірки
        const foundRoles = await this.roleRepository.findByIds(roleIds)

        if (foundRoles.length !== roleIds.length) {
            const foundIds = foundRoles.map((r) => Number(r.id))
            const missingIds = roleIds.map(Number).filter((id) => !foundIds.includes(id))
            throw new Error(`Roles not found: [${missingIds.join(', ')}]`)
        }
    }

    async validateRolesExist(roleIds) {
        if (!roleIds || roleIds.length === 0) return

        // Один запит до БД замість циклу
        const foundRoles = await this.repo.findByIds(roleIds)

        if (foundRoles.length !== roleIds.length) {
            const foundIds = foundRoles.map((r) => r.id)
            const missingIds = roleIds.filter((id) => !foundIds.includes(Number(id)))

            throw new Error(`Ролі з ID [${missingIds.join(', ')}] не знайдено`)
        }
    }
}
