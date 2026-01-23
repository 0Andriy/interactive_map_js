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
