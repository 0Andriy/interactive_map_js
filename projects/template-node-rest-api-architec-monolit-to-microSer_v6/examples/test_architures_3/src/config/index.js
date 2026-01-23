import { jwtConfig } from './jwt.config.js'
import { dbConfig } from './database.config.js'

export const config = Object.freeze({
    jwt: jwtConfig,
    db: dbConfig,
    app: {
        port: process.env.PORT || 3000,
        env: process.env.NODE_ENV || 'development',
    },
})
