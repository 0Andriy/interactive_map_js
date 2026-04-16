/**
 * @file Контролер для обробки HTTP-запитів модуля користувачів.
 */

export class UserController {
    /**
     * @param {UserService} userService - Сервіс користувачів
     */
    constructor(userService) {
        this.userService = userService
    }

    /**
     * Отримання списку користувачів з фільтрами та пагінацією
     */
    getUsers = async (req, res) => {
        const { page, limit, search } = req.query

        // Передаємо параметри в сервіс. Валідація типів вже відбулася в middleware
        const result = await this.userService.getUsers({
            page: parseInt(page),
            limit: parseInt(limit),
            search,
        })

        // Моделі User в результаті автоматично викличуть toJSON()
        res.json({
            status: 'success',
            ...result,
        })
    }

    /**
     * Отримання профілю поточного користувача (себе)
     */
    getMe = async (req, res) => {
        // ID беремо з req.user, який встановив authenticateToken
        const user = await this.userService.getUserById(req.user.id)
        res.json({ status: 'success', data: user })
    }

    /**
     * Отримання конкретного користувача за ID
     */
    getUser = async (req, res) => {
        const user = await this.userService.getUserById(req.params.id)
        res.json({ status: 'success', data: user })
    }

    /**
     * Створення нового користувача
     */
    create = async (req, res) => {
        const newUser = await this.userService.createUser(req.body)
        res.status(201).json({ status: 'success', data: newUser })
    }

    /**
     * Оновлення даних користувача
     */
    update = async (req, res) => {
        const updatedUser = await this.userService.updateUser(req.params.id, req.body)
        res.json({ status: 'success', data: updatedUser })
    }

    /**
     * Зміна статусу активності (блокування/розблокування)
     */
    toggleStatus = async (req, res) => {
        const { isActive } = req.body
        const user = await this.userService.toggleUserStatus(req.params.id, isActive)
        res.json({ status: 'success', data: user })
    }

    /**
     * Видалення користувача
     */
    delete = async (req, res) => {
        await this.userService.deleteUser(req.params.id)
        // 204 No Content - стандарт для видалення
        res.status(204).send()
    }
}

// export class UserController {
//     constructor(userService) {
//         this.userService = userService
//     }

//     getAll = async (req, res) => {
//         const users = await this.userService.getAllUsers()
//         res.json({ status: 'success', data: users })
//     }

//     getOne = async (req, res) => {
//         const user = await this.userService.getUserById(req.params.id)
//         res.json({ status: 'success', data: user })
//     }

//     getMe = async (req, res) => {
//         // Витягуємо dbName, який визначив middleware раніше
//         const { dbName, user } = req

//         const result = await this.userService.getUserProfile(dbName, user.userId)

//         res.json({ status: 'success', data: result })
//     }

//     create = async (req, res) => {
//         const newUser = await this.userService.createUser(req.body)
//         res.status(201).json({ status: 'success', data: newUser })
//     }

//     update = async (req, res) => {
//         const updated = await this.userService.updateUser(req.params.id, req.body)
//         res.json({ status: 'success', data: updated })
//     }

//     delete = async (req, res) => {
//         await this.userService.removeUser(req.params.id)
//         res.status(204).send()
//     }
// }
