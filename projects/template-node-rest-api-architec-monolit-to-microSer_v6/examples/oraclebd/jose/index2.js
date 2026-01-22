// 1. Створюємо мапу ключів (можна зберігати в env або БД)
const keysConfig = {
    'access-key-id-1': {
        private_key: process.env.ACCESS_PRIVATE_KEY,
        public_key: process.env.ACCESS_PUBLIC_KEY,
        algorithm: 'RS256',
    },
    'refresh-key-id-1': {
        private_key: process.env.REFRESH_PRIVATE_KEY,
        public_key: process.env.REFRESH_PUBLIC_KEY,
        algorithm: 'RS256',
    },
}

// 2. Реалізуємо resolver
const keyResolver = async ({ kid, alg }, payload, operation) => {
    const keyData = keysConfig[kid]
    if (!keyData) throw new Error(`Key with kid ${kid} not found`)

    // Використовуємо статик-метод вашого класу для перетворення
    return await JwtService.transformToJoseKey(keyData, alg || keyData.algorithm, operation)
}

// 3. Ініціалізація
const jwtService = new JwtService({ keyResolver })

// 4. Використання
const accessToken = await jwtService.sign(userPayload, {
    kid: 'access-key-id-1',
    expiresIn: '15m',
})

const refreshToken = await jwtService.sign(userPayload, {
    kid: 'refresh-key-id-1',
    expiresIn: '30d',
})



const keyResolver2 = async (header, payload, operation) => {
    // Якщо при верифікації заголовок ще не розпарсений,
    // jose передає header. kid може бути там.
    // Якщо ж ми підписуємо (sign), payload доступний напряму.

    const isRefresh = payload?.token_type === 'refresh' || header?.kid?.includes('refresh')

    const keyData = isRefresh
        ? { private_key: '...', public_key: '...', algorithm: 'RS256' }
        : { private_key: '...', public_key: '...', algorithm: 'RS256' }

    return await JwtService.transformToJoseKey(keyData, header.alg, operation)
}

// При виклику:
await jwtService.sign({ uid: 1, token_type: 'refresh' }, { expiresIn: '30d' })



// async signAccess(payload, options = {}) {
//     return this.sign(payload, {
//         ...options,
//         kid: 'access-key-id', // зафіксований ID для access
//         expiresIn: options.expiresIn || '15m'
//     });
// }

// async signRefresh(payload, options = {}) {
//     return this.sign(payload, {
//         ...options,
//         kid: 'refresh-key-id', // зафіксований ID для refresh
//         expiresIn: options.expiresIn || '7d'
//     });
// }
