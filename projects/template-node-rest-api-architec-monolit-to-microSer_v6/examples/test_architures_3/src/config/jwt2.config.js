export const jwtConfig = Object.freeze({
    // Типи токенів (замість Enum)
    types: {
        ACCESS: 'access',
        REFRESH: 'refresh',
        RESET_PWD: 'reset_password',
    },
    // Детальні налаштування для кожного типу
    options: {
        access: {
            algorithm: 'RS256',
            expiresIn: '15m',
            issuer: 'api.myapp.com',
            keys: {
                public: process.env.JWT_ACCESS_PUBLIC,
                private: process.env.JWT_ACCESS_PRIVATE,
            },
        },
        refresh: {
            algorithm: 'HS512',
            expiresIn: '30d',
            issuer: 'api.myapp.com',
            keys: {
                secret: process.env.JWT_REFRESH_SECRET,
            },
        },
    },
})

// // Имитация Enum
// export const TokenType = Object.freeze({
//     ACCESS: 'access',
//     REFRESH: 'refresh',
//     API_KEY: 'api_key' // Наш новый третий тип
// });

// // Единый конфиг
// export const jwtConfig = {
//     [TokenType.ACCESS]: {
//         id: 'access',
//         algorithm: 'RS256',
//         expiresIn: '15m',
//         issuer: 'auth.system.com'
//     },
//     [TokenType.REFRESH]: {
//         id: 'refresh',
//         algorithm: 'HS512',
//         expiresIn: '30d',
//         issuer: 'auth.system.com'
//     },
//     [TokenType.API_KEY]: {
//         id: 'api_key',
//         algorithm: 'ES256', // Другой алгоритм для примера
//         expiresIn: '365d',
//         issuer: 'api.system.com'
//     }
// };
