export const TokenRegistry = Object.freeze({
    ACCESS: {
        id: 'access',
        algorithm: 'RS256',
        expiresIn: '15m',
        issuer: 'api.myapp.com',
        // Визначаємо, які ключі використовувати
        keys: {
            public: process.env.JWT_ACCESS_PUBLIC,
            private: process.env.JWT_ACCESS_PRIVATE,
        },
    },
    REFRESH: {
        id: 'refresh',
        algorithm: 'HS512',
        expiresIn: '30d',
        issuer: 'api.myapp.com',
        keys: {
            secret: process.env.JWT_REFRESH_SECRET,
        },
    },
    RESET_PASSWORD: {
        id: 'reset_pwd',
        algorithm: 'HS256',
        expiresIn: '1h',
        issuer: 'api.myapp.com',
        keys: {
            secret: process.env.JWT_RESET_SECRET,
        },
    },
})
