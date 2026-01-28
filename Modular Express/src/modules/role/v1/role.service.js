// role.service.js
import Role from './role.model.js'

/**
 * Покращений сервіс з бізнес-валідацією та обробкою помилок.
 */
class RoleService {
    constructor(roleRepository) {
        this.roleRepository = roleRepository
    }

    async getAllRoles() {
        try {
            return await this.roleRepository.findAll()
        } catch (error) {
            // Логування помилки (наприклад, через Winston або Pino)
            throw new Error(`Failed to fetch roles: ${error.message}`)
        }
    }

    async getRoleById(id) {
        if (!id || isNaN(id)) {
            throw new Error('Invalid Role ID provided')
        }

        const role = await this.roleRepository.findById(id)
        if (!role) {
            throw new Error(`Role with ID ${id} not found`)
        }
        return role
    }

    async createRole(roleData) {
        // Перевірка наявності перед створенням
        await this.getRoleById(id)

        // 1. Бізнес-валідація: Обов'язкове поле
        if (!roleData.name) {
            throw new Error('Role name is required')
        }

        // 2. Нормалізація: Назви ролей в системі зазвичай в верхньому регістрі
        const normalizedData = {
            ...roleData,
            name: roleData.name.toUpperCase().trim(),
        }

        const newRole = new Role(normalizedData)
        return await this.roleRepository.create(newRole)
    }

    async updateRole(id, roleData) {
        // Перевірка наявності перед оновленням
        await this.getRoleById(id)

        // Якщо оновлюємо ім'я — нормалізуємо його
        if (roleData.name) {
            roleData.name = roleData.name.toUpperCase().trim()
        }

        const success = await this.roleRepository.update(id, roleData)
        if (!success) {
            throw new Error('Role could not be updated in the database')
        }

        return await this.roleRepository.findById(id)
    }

    async deleteRole(id) {
        // Не дозволяємо видаляти системну роль "ADMIN" (Business Rule)
        const role = await this.getRoleById(id)
        if (role.name === 'ADMIN') {
            throw new Error('System role "ADMIN" cannot be deleted')
        }

        const success = await this.roleRepository.delete(id)
        if (!success) {
            throw new Error(`Role with ID ${id} could not be deleted`)
        }

        return { success: true, deletedId: id }
    }

    async validateRolesExist(roleIds) {
        if (!roleIds || roleIds.length === 0) return

        // Викликаємо репозиторій для перевірки
        const existingRoles = await this.repo.findByIds(roleIds)

        if (existingRoles.length !== roleIds.length) {
            throw new Error('Один або декілька вказаних ID ролей не існують у системі')
        }
    }

    async findByIds(ids) {
        if (!ids.length) return []

        const pk = Object.values(RoleSchema.columns).find((c) => c.isPrimaryKey).name

        // Генеруємо плейсхолдери :id0, :id1...
        const binds = {}
        const placeholders = ids
            .map((id, index) => {
                const key = `id${index}`
                binds[key] = id
                return `:${key}`
            })
            .join(', ')

        const query = `SELECT * FROM ${RoleSchema.table} WHERE ${pk} IN (${placeholders})`

        const result = await this.db.execute(query, binds, {
            outFormat: oracledb.OUT_FORMAT_OBJECT,
        })

        return result.rows.map((row) => Role.fromDatabase(row))
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

export default RoleService
