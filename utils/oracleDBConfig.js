// config.js (або інший файл, де ви зберігаєте конфігурацію)
const oracleDBConfig = {
    // Загальні налаштування для Oracle Thick Client, якщо використовуєте
    DriverMode: 'thick',
    ClientOpts: { libDir: '/path/to/instantclient' },

    // Правила маскування для логів (нові рекомендації)
    maskingRules: {
        params: [
            { pattern: /password/i, replaceWith: '***' },
            { pattern: /token/i, replaceWith: '[TOKEN_HIDDEN]' },
            { pattern: /cvv/i, replaceWith: '[CVV_MASKED]' },
        ],
    },
    maskAllParams: false, // Якщо true, переважає над maskingRules.params

    // Об'єкт 'db' містить конфігурації для кожної окремої бази даних
    db: {
        ERP_PROD: {
            user: process.env.ORACLE_ERP_USER, // Рекомендовано: використовувати змінні середовища
            password: process.env.ORACLE_ERP_PASSWORD,
            connectString: process.env.ORACLE_ERP_CONNECT_STRING, // Наприклад, 'localhost:1521/orclpdb1'
            poolMin: 10,
            poolMax: 100,
            poolIncrement: 1,
            poolAlias: 'ERP_PROD_Pool',
            // ... інші специфічні налаштування для ERP_PROD
        },
        ANALYTICS_REP: {
            user: process.env.ORACLE_ANALYTICS_USER,
            password: process.env.ORACLE_ANALYTICS_PASSWORD,
            connectString: process.env.ORACLE_ANALYTICS_CONNECT_STRING, // Наприклад, 'my-analytics-db:1521/anlytics'
            poolMin: 5,
            poolMax: 50,
            poolIncrement: 1,
            poolAlias: 'ANALYTICS_REP_Pool',
            // ... інші специфічні налаштування для ANALYTICS_REP
        },
        // Можете додати більше баз даних тут
    },
}

export default oracleDBConfig
