export const SessionSchema = {
    table: 'USER_SESSIONS',
    columns: {
        id: {
            name: 'ID',
            isPrimaryKey: true,
            type: 'RAW',
        },
        userId: {
            name: 'USER_ID',
            type: 'RAW',
        },
        refreshTokenHash: {
            name: 'REFRESH_TOKEN_HASH',
            type: 'VARCHAR2',
            hidden: true,
        },
        deviceFingerprint: {
            name: 'DEVICE_FINGERPRINT',
            type: 'VARCHAR2',
        },
        deviceInfo: {
            name: 'DEVICE_INFO',
            type: 'VARCHAR2',
        },
        ipAddress: {
            name: 'IP_ADDRESS',
            type: 'VARCHAR2',
        },
        isRevoked: {
            name: 'IS_REVOKED',
            type: 'NUMBER',
        },
        lastActivity: {
            name: 'LAST_ACTIVITY',
            type: 'TIMESTAMP',
        },
        expiresAt: {
            name: 'EXPIRES_AT',
            type: 'TIMESTAMP',
        },
        createdAt: {
            name: 'CREATED_AT',
            type: 'TIMESTAMP',
        },
    },
}
