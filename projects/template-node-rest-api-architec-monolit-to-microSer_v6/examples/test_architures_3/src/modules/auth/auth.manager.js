import { JwtService } from '../../core/jwt/jwt.service.js'
import { TokenRegistry } from '../../core/jwt/token-registry.js'
import { keyResolver } from '../../core/jwt/key-resolver.js'

class AuthManager {
    constructor() {
        this.services = {}
        // Автоматична ініціалізація всіх типів з реєстру
        Object.keys(TokenRegistry).forEach((key) => {
            const cfg = TokenRegistry[key]
            this.services[cfg.id] = new JwtService(cfg.id, cfg, keyResolver)
        })
    }

    get access() {
        return this.services[TokenRegistry.ACCESS.id]
    }
    get refresh() {
        return this.services[TokenRegistry.REFRESH.id]
    }
    get resetPwd() {
        return this.services[TokenRegistry.RESET_PASSWORD.id]
    }

    async issueTokens(user) {
        const [at, rt] = await Promise.all([
            this.access.sign({ sub: user.id, role: user.role }),
            this.refresh.sign({ sub: user.id }),
        ])
        return { accessToken: at, refreshToken: rt }
    }
}

export const authManager = new AuthManager()

// export class AuthManager {
//     constructor(accessService, refreshService) {
//         this.access = accessService
//         this.refresh = refreshService
//     }

//     async issuePair(payload) {
//         return {
//             accessToken: await this.access.sign(payload),
//             refreshToken: await this.refresh.sign({ sub: payload.sub }),
//         }
//     }
// }
