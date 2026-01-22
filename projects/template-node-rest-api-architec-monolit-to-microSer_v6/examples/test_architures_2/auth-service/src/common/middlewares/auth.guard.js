// src/common/middlewares/auth.guard.js
export const authGuard = (tokenService) => async (req, res, next) => {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Unauthorized: No token provided' })
    }

    const token = authHeader.split(' ')[1]
    try {
        const payload = await tokenService.verifyAccess(token)
        req.user = payload // Додаємо дані юзера в об'єкт запиту
        next()
    } catch (err) {
        res.status(401).json({ message: 'Invalid or expired token' })
    }
}
