// src/modules/user/user.controller.js
export class UserController {
    constructor(userService) {
        this.userService = userService
    }

    async getMe(req, res) {
        try {
            // req.user.sub містить ID користувача з JWT токену
            const user = await this.userService.getById(req.user.sub)
            if (!user) return res.status(404).json({ message: 'User not found' })
            res.json(user)
        } catch (err) {
            res.status(500).json({ error: err.message })
        }
    }

    // Внутрішній метод для Auth-Service
    async getInternalUserByEmail(req, res) {
        try {
            const { email } = req.query
            const user = await this.userService.getByEmail(email)
            if (!user) return res.status(404).json({ message: 'User not found' })
            res.json(user)
        } catch (err) {
            res.status(500).json({ error: err.message })
        }
    }

    async getProfile(req, res) {
        try {
            const user = await this.userService.getById(req.params.id)
            res.json(user)
        } catch (err) {
            res.status(500).json({ error: err.message })
        }
    }
}
