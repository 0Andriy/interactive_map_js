// src/modules/auth/auth.controller.js
export class AuthController {
    constructor(authService) {
        this.authService = authService
    }

    async login(req, res) {
        try {
            const { email, password } = req.body
            const result = await this.authService.login(email, password)
            res.status(200).json(result)
        } catch (error) {
            res.status(401).json({ error: error.message })
        }
    }

    async logout(req, res) {
        // req.user вже доступний завдяки authGuard
        await this.authService.revokeToken(req.user.sub)
        res.status(204).send()
    }
}
