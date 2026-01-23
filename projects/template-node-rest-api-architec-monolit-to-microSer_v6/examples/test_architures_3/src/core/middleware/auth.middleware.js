import { JwtService } from '../jwt/jwt.service.js'
import { TokenRegistry } from '../jwt/token-registry.js'
import { keyResolver } from '../jwt/key-resolver.js'

const verifier = new JwtService(TokenRegistry.ACCESS.id, TokenRegistry.ACCESS, keyResolver)

export const authGuard = async (req, res, next) => {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) return res.sendStatus(401)

    const token = authHeader.split(' ')[1]

    try {
        const payload = await verifier.verify(token)

        // Перевірка Blacklist в Redis (куди брокер кладе забанених)
        // const isRevoked = await redis.get(`revoked:${payload.sub}`);
        // if (isRevoked) return res.sendStatus(401);

        req.user = payload
        next()
    } catch (err) {
        res.status(401).json({ error: err.message })
    }
}
