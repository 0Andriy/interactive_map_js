// auth.schema.js
/**
 * Схема для зберігання сесій/токенів у Oracle.
 */
const AuthSchema = {
    table: 'APP_USER_SESSIONS',
    columns: {
        id: {
            name: 'SESSION_ID',
            type: 'NUMBER',
            isPrimaryKey: true,
        },
        userId: {
            name: 'USER_ID',
            type: 'NUMBER',
        },
        token: {
            name: 'ACCESS_TOKEN',
            type: 'VARCHAR2(1000)',
        },
        refreshToken: {
            name: 'REFRESH_TOKEN',
            type: 'VARCHAR2(1000)',
        },
        expiresAt: {
            name: 'EXPIRES_AT',
            type: 'DATE',
        },
        createdAt: {
            name: 'CREATED_AT',
            type: 'DATE',
        },
        ipAddress: {
            name: 'IP_ADDRESS',
            type: 'VARCHAR2(45)',
        },
    },
}

export default AuthSchema
