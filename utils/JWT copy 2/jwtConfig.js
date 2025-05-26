export const tokenConfigs = {
    access: {
        source: 'env', // секрет з env
        secretEnvKey: 'JWT_ACCESS_SECRET',
        expiresIn: '15m',
        async: false,
        signOptions: { algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
    },
    refresh: {
        source: 'db', // ключі з бази
        privateKeyDbKey: 'refresh_private_key',
        publicKeyDbKey: 'refresh_public_key',
        expiresIn: '7d',
        async: true,
        signOptions: { algorithm: 'RS256' },
        verifyOptions: { algorithms: ['RS256'] },
    },
}
