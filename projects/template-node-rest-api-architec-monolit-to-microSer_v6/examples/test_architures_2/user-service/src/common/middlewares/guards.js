import { verifyToken } from '../../infrastructure/token-verifier.js'

// Глоабльный AuthGuard
export const authGuard = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) return res.status(401).json({ message: 'No token' })

    try {
        req.user = await verifyToken(token)
        next()
    } catch (err) {
        res.status(401).json({ message: 'Invalid token' })
    }
}

// RolesGuard (фабрика)
export const rolesGuard = (allowedRoles) => (req, res, next) => {
    if (!req.user || !req.user.roles) {
        return res.status(403).json({ message: 'Forbidden: No roles assigned' })
    }

    const hasRole = req.user.roles.some((role) => allowedRoles.includes(role))
    if (!hasRole) {
        return res.status(403).json({ message: 'Forbidden: Insufficient permissions' })
    }

    next()
}
