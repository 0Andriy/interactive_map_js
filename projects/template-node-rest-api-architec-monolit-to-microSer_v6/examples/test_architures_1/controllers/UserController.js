// src/controllers/UserController.js
export class UserController {
    constructor(userService) {
        this.userService = userService
    }

    // Використовуємо стрілкові функції, щоб не втратити контекст 'this' в Express
    getUser = async (req, res, next) => {
        try {
            const { id } = req.params
            const user = await this.userService.findUser(id)
            res.json(user)
        } catch (error) {
            next(error) // Передаємо помилку в middleware
        }
    }

    register = async (req, res, next) => {
        try {
            const result = await this.userService.registerUser(req.body)
            res.status(201).json(result)
        } catch (error) {
            next(error)
        }
    }
}
