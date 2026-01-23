export const dbConfig = Object.freeze({
    connections: {
        PRIMARY: {
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECT_STRING, // "localhost/xe"
            poolMin: 2,
            poolMax: 10,
            poolIncrement: 1,
        },
        ANALYTICS: {
            user: process.env.DB_ANALYTICS_USER,
            password: process.env.DB_ANALYTICS_PASSWORD,
            connectString: process.env.DB_ANALYTICS_TNS,
            poolMin: 1,
            poolMax: 5,
        },
    },
})
