import 'dotenv/config'

export const config = {
    port: process.env.PORT || 3001,
    userServiceUrl: process.env.USER_SERVICE_URL || 'http://localhost:3002',
    oracle: {
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        connectString: process.env.DB_CONN_STRING,
    },
    jwt: {
        accessSecret: process.env.JWT_ACCESS_SECRET || 'super-secret-access',
        refreshSecret: process.env.JWT_REFRESH_SECRET || 'super-secret-refresh',
    },
    rabbitmq: {
        url: process.env.RABBITMQ_URL || 'amqp://localhost',
    },
}
