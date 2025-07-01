// schema/oracleSchema.js

/**
 * Визначення схеми бази даних.
 * Описує таблиці, їхні стовпці, обмеження, індекси та коментарі у декларативному форматі.
 * Кожен об'єкт в масиві `tables` представляє одну таблицю.
 */
export const schemaDefinitions = {
    tables: [
        {
            name: 'USERS',
            tableComment:
                "Таблиця для зберігання інформації про користувачів системи з підтримкою м'якого видалення.",
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
            // Обмеження на рівні таблиці. PK та UNIQUE на стовпцях обробляються окремо.
            constraints: [],
            // Додаткові індекси, які не створюються автоматично PRIMARY KEY або UNIQUE обмеженнями.
            indexes: [{ name: 'IDX_USERS_DELETED_AT', columns: ['DELETED_AT'] }],
        },
        {
            name: 'ROLES',
            tableComment: 'Таблиця для зберігання визначених ролей користувачів у системі.',
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
            indexes: [
                // IDX_ROLES_ROLE_NAME вже створюється завдяки unique: true на стовпці ROLE_NAME
                // Якщо потрібен окремий індекс з іншими властивостями, можна додати тут
            ],
        },
        {
            name: 'USER_ROLES',
            tableComment:
                "Проміжна таблиця для зв'язку користувачів з ролями (багато-до-багатьох).",
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
                {
                    name: 'IS_ACTIVE',
                    type: 'NUMBER(1)',
                    notNull: true,
                    default: 1,
                    comment: 'Статус активності цієї конкретної ролі для користувача.',
                },
            ],
            constraints: [
                {
                    name: 'FK_USER_ROLES_USER',
                    type: 'FOREIGN KEY',
                    columns: ['USER_ID'],
                    references: 'USERS(USER_ID)',
                    onDelete: 'CASCADE', // ON DELETE CASCADE
                },
                {
                    name: 'FK_USER_ROLES_ROLE',
                    type: 'FOREIGN KEY',
                    columns: ['ROLE_ID'],
                    references: 'ROLES(ROLE_ID)',
                    onDelete: 'CASCADE', // ON DELETE CASCADE
                },
                {
                    name: 'UK_USER_ROLES',
                    type: 'UNIQUE',
                    columns: ['USER_ID', 'ROLE_ID'],
                },
            ],
            indexes: [
                { name: 'IDX_USER_ROLES_USER_ID', columns: ['USER_ID'] }, // Індекси на FK-стовпцях часто корисні
                { name: 'IDX_USER_ROLES_ROLE_ID', columns: ['ROLE_ID'] },
            ],
        },
        {
            name: 'REFRESH_TOKENS',
            tableComment: 'Таблиця для зберігання refresh-токенів користувачів.',
            columns: [
                {
                    name: 'TOKEN_ID',
                    type: 'NUMBER(10)',
                    primaryKey: true,
                    identity: true,
                    comment: 'Унікальний ідентифікатор refresh-токена.',
                },
                {
                    name: 'USER_ID',
                    type: 'NUMBER(10)',
                    notNull: true,
                    comment: 'Ідентифікатор користувача, якому належить refresh-токен.',
                },
                {
                    name: 'TOKEN',
                    type: 'VARCHAR2(512)',
                    notNull: true,
                    unique: true,
                    comment: 'Сам refresh-токен (хешований).',
                }, // Змінено на 512, як у вихідному прикладі
                {
                    name: 'EXPIRATION_DATE',
                    type: 'TIMESTAMP',
                    notNull: true,
                    comment: 'Дата і час закінчення дії refresh-токена.',
                },
                {
                    name: 'CREATED_AT',
                    type: 'TIMESTAMP',
                    notNull: true,
                    default: 'SYSTIMESTAMP',
                    comment: 'Дата і час створення refresh-токена.',
                },
                {
                    name: 'IP_ADDRESS',
                    type: 'VARCHAR2(45)',
                    comment: 'IP-адреса, з якої був виданий токен.',
                },
                {
                    name: 'USER_AGENT',
                    type: 'VARCHAR2(255)',
                    comment: 'User-Agent, з якого був виданий токен.',
                },
                {
                    name: 'IS_REVOKED',
                    type: 'NUMBER(1)',
                    notNull: true,
                    default: 0,
                    comment: 'Статус відкликання токена (1 - відкликаний, 0 - активний).',
                },
            ],
            constraints: [
                {
                    name: 'FK_REFRESH_TOKENS_USER',
                    type: 'FOREIGN KEY',
                    columns: ['USER_ID'],
                    references: 'USERS(USER_ID)',
                    onDelete: 'CASCADE', // ON DELETE CASCADE
                },
            ],
            indexes: [
                { name: 'IDX_REFRESH_TOKENS_USER_ID', columns: ['USER_ID'] },
                // IDX_REFRESH_TOKENS_TOKEN вже створюється завдяки unique: true на стовпці TOKEN
            ],
        },
    ],
}
