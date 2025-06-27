// schema/oracleSchema.js
export const schemaDefinitionsExample = {
    tables: [
        /* Масив об'єктів, що описують кожну таблицю */
    ],
    // Можна додати інші типи об'єктів БД:
    // views: [ /* Масив об'єктів, що описують View */ ],
    // sequences: [ /* Масив об'єктів, що описують Sequence */ ],
    // procedures: [ /* Масив об'єктів, що описують збережені процедури */ ],
    // functions: [ /* Масив об'єктів, що описують функції */ ],
    // packages: [ /* Масив об'єктів, що описують пакети (для Oracle) */ ],
    // triggers: [ /* Масив об'єктів, що описують тригери */ ],
}

export const schemaDefinitions = {
    tables: [
        {
            name: 'USERS',
            columns: [
                {
                    name: 'USER_ID',
                    type: 'NUMBER(10)',
                    primaryKey: true,
                    identity: true,
                    comment: 'Унікальний ідентифікатор користувача.',
                },
                {
                    name: 'USERNAME',
                    type: 'VARCHAR2(50)',
                    notNull: true,
                    unique: true,
                    comment: "Ім'я користувача (логін) для входу.",
                },
                {
                    name: 'EMAIL',
                    type: 'VARCHAR2(100)',
                    notNull: true,
                    unique: true,
                    comment:
                        'Електронна пошта користувача, використовується для входу та відновлення пароля.',
                },
                {
                    name: 'PASSWORD_HASH',
                    type: 'VARCHAR2(255)',
                    notNull: true,
                    comment: 'Хеш пароля користувача.',
                },
                { name: 'SALT', type: 'VARCHAR2(255)', comment: 'Сіль для хешування пароля.' },
                { name: 'FIRST_NAME', type: 'VARCHAR2(50)', comment: "Ім'я користувача." },
                { name: 'LAST_NAME', type: 'VARCHAR2(50)', comment: 'Прізвище користувача.' },
                {
                    name: 'IS_ACTIVE',
                    type: 'NUMBER(1)',
                    notNull: true,
                    default: 1,
                    comment: 'Статус активності облікового запису (1 - активний, 0 - неактивний).',
                },
                {
                    name: 'IS_EMAIL_VERIFIED',
                    type: 'NUMBER(1)',
                    notNull: true,
                    default: 0,
                    comment:
                        'Статус підтвердження електронної пошти (1 - підтверджено, 0 - не підтверджено).',
                },
                {
                    name: 'CREATED_AT',
                    type: 'TIMESTAMP',
                    notNull: true,
                    default: 'SYSTIMESTAMP',
                    comment: 'Дата і час створення облікового запису.',
                },
                {
                    name: 'UPDATED_AT',
                    type: 'TIMESTAMP',
                    notNull: true,
                    default: 'SYSTIMESTAMP',
                    comment: 'Дата і час останнього оновлення облікового запису.',
                },
                {
                    name: 'DELETED_AT',
                    type: 'TIMESTAMP',
                    comment:
                        "Дата і час м'якого видалення облікового запису. NULL, якщо обліковий запис не видалено.",
                },
                {
                    name: 'LAST_LOGIN_AT',
                    type: 'TIMESTAMP',
                    comment: 'Дата і час останнього входу користувача.',
                },
                {
                    name: 'TWO_FACTOR_SECRET',
                    type: 'VARCHAR2(255)',
                    comment: 'Секрет для двофакторної аутентифікації.',
                },
                {
                    name: 'VERIFICATION_CODE',
                    type: 'VARCHAR2(64)',
                    comment: 'Код для верифікації електронної пошти.',
                },
                {
                    name: 'VERIFICATION_EXPIRATION',
                    type: 'TIMESTAMP',
                    comment: 'Термін дії коду верифікації.',
                },
                {
                    name: 'PASSWORD_RESET_TOKEN',
                    type: 'VARCHAR2(64)',
                    comment: 'Токен для скидання пароля.',
                },
                {
                    name: 'PASSWORD_RESET_EXPIRATION',
                    type: 'TIMESTAMP',
                    comment: 'Термін дії токена скидання пароля.',
                },
            ],
            constraints: [],
            indexes: [{ name: 'IDX_USERS_DELETED_AT', columns: ['DELETED_AT'] }],
            tableComment:
                "Таблиця для зберігання інформації про користувачів системи з підтримкою м'якого видалення.",
        },
        {
            name: 'ROLES',
            columns: [
                {
                    name: 'ROLE_ID',
                    type: 'NUMBER(10)',
                    primaryKey: true,
                    identity: true,
                    comment: 'Унікальний ідентифікатор ролі.',
                },
                {
                    name: 'ROLE_NAME',
                    type: 'VARCHAR2(50)',
                    notNull: true,
                    unique: true,
                    comment: 'Назва ролі (наприклад, ADMIN, USER, GUEST).',
                },
                { name: 'DESCRIPTION', type: 'VARCHAR2(255)', comment: 'Опис ролі.' },
                {
                    name: 'CREATED_AT',
                    type: 'TIMESTAMP',
                    notNull: true,
                    default: 'SYSTIMESTAMP',
                    comment: 'Дата і час створення ролі.',
                },
                {
                    name: 'UPDATED_AT',
                    type: 'TIMESTAMP',
                    notNull: true,
                    default: 'SYSTIMESTAMP',
                    comment: 'Дата і час останнього оновлення ролі.',
                },
            ],
            constraints: [],
            indexes: [{ name: 'IDX_ROLES_ROLE_NAME', columns: ['ROLE_NAME'], unique: true }],
            tableComment: 'Таблиця для зберігання визначених ролей користувачів у системі.',
        },
        {
            name: 'USER_ROLES',
            columns: [
                {
                    name: 'USER_ROLE_ID',
                    type: 'NUMBER(10)',
                    primaryKey: true,
                    identity: true,
                    comment: "Унікальний ідентифікатор зв'язку користувача з роллю.",
                },
                {
                    name: 'USER_ID',
                    type: 'NUMBER(10)',
                    notNull: true,
                    comment: 'Ідентифікатор користувача.',
                },
                {
                    name: 'ROLE_ID',
                    type: 'NUMBER(10)',
                    notNull: true,
                    comment: 'Ідентифікатор ролі.',
                },
                {
                    name: 'ASSIGNED_AT',
                    type: 'TIMESTAMP',
                    notNull: true,
                    default: 'SYSTIMESTAMP',
                    comment: 'Дата і час призначення ролі користувачеві.',
                },
            ],
            constraints: [
                {
                    name: 'FK_USER_ROLES_USERS',
                    type: 'FOREIGN KEY',
                    columns: ['USER_ID'],
                    references: 'USERS(USER_ID)',
                },
                {
                    name: 'FK_USER_ROLES_ROLES',
                    type: 'FOREIGN KEY',
                    columns: ['ROLE_ID'],
                    references: 'ROLES(ROLE_ID)',
                },
                {
                    name: 'UQ_USER_ROLES_USER_ROLE',
                    type: 'UNIQUE',
                    columns: ['USER_ID', 'ROLE_ID'],
                },
            ],
            indexes: [
                { name: 'IDX_USER_ROLES_USER_ID', columns: ['USER_ID'] },
                { name: 'IDX_USER_ROLES_ROLE_ID', columns: ['ROLE_ID'] },
            ],
            tableComment:
                "Таблиця зв'язку багато-до-багатьох між користувачами та ролями, що визначає, які ролі призначені якому користувачеві.",
        },
        {
            name: 'REFRESH_TOKENS',
            columns: [
                {
                    name: 'TOKEN_ID',
                    type: 'NUMBER(10)',
                    primaryKey: true,
                    identity: true,
                    comment: 'Унікальний ідентифікатор токена оновлення.',
                },
                {
                    name: 'USER_ID',
                    type: 'NUMBER(10)',
                    notNull: true,
                    comment: 'Ідентифікатор користувача, якому належить токен.',
                },
                {
                    name: 'TOKEN',
                    type: 'VARCHAR2(255)',
                    notNull: true,
                    unique: true,
                    comment: 'Сам токен оновлення.',
                },
                {
                    name: 'EXPIRES_AT',
                    type: 'TIMESTAMP',
                    notNull: true,
                    comment: 'Термін дії токена оновлення.',
                },
                {
                    name: 'CREATED_AT',
                    type: 'TIMESTAMP',
                    notNull: true,
                    default: 'SYSTIMESTAMP',
                    comment: 'Дата і час створення токена.',
                },
                {
                    name: 'REVOKED_AT',
                    type: 'TIMESTAMP',
                    comment: "Дата і час відкликання токена (для м'якого відкликання).",
                },
                {
                    name: 'IP_ADDRESS',
                    type: 'VARCHAR2(45)',
                    comment: 'IP-адреса, з якої було створено токен.',
                },
                {
                    name: 'USER_AGENT',
                    type: 'VARCHAR2(255)',
                    comment: 'User-Agent браузера/пристрою.',
                },
            ],
            constraints: [
                {
                    name: 'FK_REFRESH_TOKENS_USERS',
                    type: 'FOREIGN KEY',
                    columns: ['USER_ID'],
                    references: 'USERS(USER_ID)',
                },
            ],
            indexes: [{ name: 'IDX_REFRESH_TOKENS_USER_ID', columns: ['USER_ID'] }],
            tableComment:
                'Таблиця для зберігання refresh-токенів користувачів, що використовуються для підтримки сесій та оновлення access-токенів.',
        },
    ],
}

// <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

// utils/operationBuilder.js

export function createOperation(name, sql, type, options = {}) {
    const defaultOptions = {
        existsErrorCode: null,
        successMessage: `{type} '{name}' created successfully.`,
        existsMessage: `{type} '{name}' already exists. Skipping creation.`,
        errorMessage: `Error {type} '{name}': {message}`,
        critical: true, // За замовчуванням критичні
    }

    const finalOptions = { ...defaultOptions, ...options }

    return {
        name,
        sql,
        type,
        existsErrorCode: finalOptions.existsErrorCode,
        successMessage: finalOptions.successMessage.replace('{type}', type.toUpperCase()),
        existsMessage: finalOptions.existsMessage.replace('{type}', type.toUpperCase()),
        errorMessage: finalOptions.errorMessage.replace('{type}', type.toUpperCase()),
        critical: finalOptions.critical,
    }
}

// <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

// sql/oracleGenerators.js

import { createOperation } from '../utils/operationBuilder.js'

const escapeStringForSQL = (str) => str.replace(/'/g, "''")

const generateColumnDefinition = (column) => {
    let colDef = `${column.name} ${column.type}`
    if (column.primaryKey) colDef += ' PRIMARY KEY'
    if (column.identity) colDef += ' GENERATED BY DEFAULT ON NULL AS IDENTITY'
    if (column.notNull) colDef += ' NOT NULL'
    if (column.unique && !column.primaryKey) colDef += ' UNIQUE'
    if (column.default !== undefined) {
        colDef += ` DEFAULT ${
            typeof column.default === 'string' && column.default !== 'SYSTIMESTAMP'
                ? `'${escapeStringForSQL(column.default)}'`
                : column.default
        }`
    }
    return colDef
}

const generateConstraintDefinition = (constraint) => {
    let constraintDef = `CONSTRAINT ${constraint.name} ${constraint.type}`
    if (constraint.type === 'FOREIGN KEY') {
        constraintDef += ` (${constraint.columns.join(', ')}) REFERENCES ${constraint.references}`
    } else if (constraint.type === 'UNIQUE') {
        constraintDef += ` (${constraint.columns.join(', ')})`
    } else if (constraint.type === 'CHECK') {
        constraintDef += ` (${constraint.expression})`
    }
    return constraintDef
}

const generateCreateTableSQL = (tableDef) => {
    const columnsSQL = tableDef.columns.map(generateColumnDefinition).join(',\n        ')

    const constraintsSQL = (tableDef.constraints || [])
        .map(generateConstraintDefinition)
        .join(',\n        ')

    let tableBody = columnsSQL
    if (constraintsSQL) {
        tableBody += `,\n        ${constraintsSQL}`
    }

    return `
CREATE TABLE ${tableDef.name} (
        ${tableBody}
    )`
}

const generateCreateIndexSQL = (tableName, indexDef) => {
    return `CREATE ${indexDef.unique ? 'UNIQUE ' : ''}INDEX ${
        indexDef.name
    } ON ${tableName} (${indexDef.columns.join(', ')})`
}

const generateTableCommentSQL = (tableName, comment) => {
    return `COMMENT ON TABLE ${tableName} IS '${escapeStringForSQL(comment)}'`
}

const generateColumnCommentSQL = (tableName, columnName, comment) => {
    return `COMMENT ON COLUMN ${tableName}.${columnName} IS '${escapeStringForSQL(comment)}'`
}

export const buildSchemaOperations = (schemaDefinition) => {
    const operations = []

    for (const tableDef of schemaDefinition.tables) {
        const tableName = tableDef.name

        // Операція: Створення таблиці
        operations.push(
            createOperation(tableName, generateCreateTableSQL(tableDef), 'TABLE_CREATION', {
                existsErrorCode: 955,
                critical: true,
            }),
        )

        // Операції: Коментарі до таблиці
        if (tableDef.tableComment) {
            operations.push(
                createOperation(
                    `COMMENT_TABLE_${tableName}`,
                    generateTableCommentSQL(tableName, tableDef.tableComment),
                    'TABLE_COMMENT',
                    { critical: false },
                ),
            )
        }

        // Операції: Коментарі до стовпців
        for (const column of tableDef.columns) {
            if (column.comment) {
                operations.push(
                    createOperation(
                        `COMMENT_COLUMN_${tableName}_${column.name}`,
                        generateColumnCommentSQL(tableName, column.name, column.comment),
                        'COLUMN_COMMENT',
                        { critical: false },
                    ),
                )
            }
        }

        // Операції: Індекси
        for (const indexDef of tableDef.indexes) {
            operations.push(
                createOperation(
                    indexDef.name,
                    generateCreateIndexSQL(tableName, indexDef),
                    'INDEX_CREATION',
                    { existsErrorCode: 955, critical: true },
                ),
            )
        }
    }

    return operations
}

// <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

// core/sqlExecutor.js

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000 // 1 секунда

async function executeSqlOperation(dbName, operation, logger, oracleDbManager) {
    const {
        name,
        sql,
        type,
        existsErrorCode,
        successMessage,
        existsMessage,
        errorMessage,
        critical,
    } = operation

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            await oracleDbManager.execute(dbName, sql)
            logger.info(successMessage.replace('{name}', name.toUpperCase()))
            return
        } catch (error) {
            if (existsErrorCode && error.oracleErrorNum === existsErrorCode) {
                logger.warn(existsMessage.replace('{name}', name.toUpperCase()))
                return
            }

            logger.error(
                errorMessage
                    .replace('{name}', name.toUpperCase())
                    .replace('{message}', error.message),
                { error, attempt: attempt, maxAttempts: MAX_RETRIES },
            )

            if (critical && attempt < MAX_RETRIES) {
                logger.warn(`Retrying operation '${name}' (Attempt ${attempt}/${MAX_RETRIES})...`)
                await new Promise((resolve) =>
                    setTimeout(resolve, RETRY_DELAY_MS * Math.pow(2, attempt - 1)),
                )
            } else if (critical && attempt === MAX_RETRIES) {
                throw error
            } else {
                return
            }
        }
    }
}

export async function runSchemaOperations(dbName, operations, logger, oracleDbManager) {
    for (const operation of operations) {
        await executeSqlOperation(dbName, operation, logger, oracleDbManager)
    }
}

// <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
// dbInitializer.js

import { schemaDefinitions } from './schema/oracleSchema.js'
import { buildSchemaOperations } from './sql/oracleGenerators.js'
import { runSchemaOperations } from './core/sqlExecutor.js'

// --- Приклад імітації залежностей ---
// Вам потрібно буде замінити це на ваші реальні реалізації
const mockOracleDbManager = {
    execute: async (dbName, sql) => {
        // Імітуємо затримку виконання запиту
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 100 + 50))
        // Імітуємо помилку ORA-00955 для демонстрації "вже існує"
        if (sql.includes('CREATE TABLE USERS') && Math.random() > 0.5) {
            // 50% шанс, що вже існує
            const error = new Error('ORA-00955: name is already used by an existing object')
            error.oracleErrorNum = 955
            throw error
        }
        // Імітуємо інші помилки для демонстрації retry
        if (
            sql.includes('CREATE TABLE ROLES') &&
            Math.random() > 0.7 &&
            mockOracleDbManager.errorCount < 2
        ) {
            mockOracleDbManager.errorCount = (mockOracleDbManager.errorCount || 0) + 1
            throw new Error('Simulated database connection error')
        }
        // console.log(`Executing SQL for ${dbName}:\n${sql}`);
        return { rowsAffected: 1 }
    },
    errorCount: 0, // Для імітації помилок
}

const mockLogger = {
    info: (...args) => console.log(`[INFO] ${args.join(' ')}`),
    warn: (...args) => console.warn(`[WARN] ${args.join(' ')}`),
    error: (...args) => console.error(`[ERROR] ${args.join(' ')}`),
}
// --- Кінець імітації ---

export async function initializeDatabase(dbName) {
    mockLogger.info('Starting database schema initialization process...')

    try {
        const operations = buildSchemaOperations(schemaDefinitions)
        await runSchemaOperations(dbName, operations, mockLogger, mockOracleDbManager)
        mockLogger.info('Database schema initialization completed successfully.')
    } catch (error) {
        mockLogger.error(`Database schema initialization failed: ${error.message}`, { error })
        throw error
    }
}

// Приклад використання в якості самостійного скрипту:
// Для запуску в Node.js, збережіть цей файл як `dbInitializer.js`
// і запустіть: `node --experimental-modules dbInitializer.js` (для старіших версій Node.js)
// або додайте `"type": "module"` до вашого `package.json` і просто `node dbInitializer.js`
// (Node.js 14+ підтримує ES modules).

const DB_NAME = 'YOUR_ORACLE_DB_CONNECTION'

;(async () => {
    try {
        await initializeDatabase(DB_NAME)
        console.log('Script finished successfully.')
        process.exit(0)
    } catch (error) {
        console.error('Script terminated with errors.')
        process.exit(1)
    }
})()
