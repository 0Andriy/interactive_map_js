/**
 * Схема метаданих для сутності Role.
 * Використовується для мапінгу об'єктів на колонки Oracle DB.
 */
export const RoleSchema = {
    table: 'APP_ROLES',
    columns: {
        id: {
            name: 'ROLE_ID',
            type: 'NUMBER',
            isPrimaryKey: true,
        },
        name: {
            name: 'ROLE_NAME',
            type: 'VARCHAR2',
        },
        description: {
            name: 'ROLE_DESC',
            type: 'VARCHAR2',
        },
        createdAt: {
            name: 'CREATED_AT',
            type: 'DATE',
        },
    },
}
