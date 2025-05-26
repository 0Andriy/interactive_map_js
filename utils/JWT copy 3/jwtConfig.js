export const tokenConfigs = {
    access: {
        source: 'env',
        secretEnvKey: 'JWT_ACCESS_SECRET',
        expiresIn: '15m',
        async: false,
        signOptions: { algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
    },
    refresh: {
        source: 'file', // тепер читаємо ключі з файлів
        privateKeyFile: './keys/refresh_private.pem',
        publicKeyFile: './keys/refresh_public.pem',
        expiresIn: '7d',
        async: true,
        signOptions: { algorithm: 'RS256' },
        verifyOptions: { algorithms: ['RS256'] },
        cacheTTLSeconds: 3600, // кешуємо 1 годину
    },
}
