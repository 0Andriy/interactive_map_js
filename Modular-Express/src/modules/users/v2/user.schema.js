// user.schema.js
/**
 * Схема метаданих для сутності User.
 * Використовується для мапінгу об'єктів на колонки Oracle DB.
 */
const UserSchema = {
    table: 'APP_USERS',
    // Таблиця зв'язків для Many-to-Many
    pivotTable: 'USER_ROLES_LINK',
    columns: {
        id: {
            name: 'USER_ID',
            type: 'NUMBER',
            isPrimaryKey: true,
        },
        username: {
            name: 'USER_LOGIN',
            type: 'VARCHAR2',
        },
        email: {
            name: 'USER_EMAIL',
            type: 'VARCHAR2',
        },
        password: {
            name: 'USER_PWD',
            type: 'VARCHAR2',
            hidden: true, // Приховуємо пароль від JSON
        },
        isActive: {
            name: 'IS_ACTIVE',
            type: 'NUMBER', // В Oracle часто використовують 0/1 для boolean
        },
    },
    // Опис колонок для таблиці зв'язку
    pivotColumns: {
        userId: 'L_USER_ID',
        roleId: 'L_ROLE_ID',
    },
}

export default UserSchema
