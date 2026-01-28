src/
├── config/
│   ├── database.config.js       # Налаштування підключення до Oracle
│   └── auth.config.js           # Назви кук, терміни дії JWT, алгоритми
├── common/
│   ├── database.service.js      # Обгортка над Oracle Pool (execute/transaction)
│   └── middlewares/
│       ├── validation.middleware.js # Універсальний Zod-валідатор
│       └── error.middleware.js      # Глобальний обробник CustomError
├── utils/
│   └── CustomError.js           # Клас для типізованих помилок (401, 403, 422)
├── keys/                        # Папка для RS256 ключів (private.key, public.key)
├── modules/
│   ├── role/
│   │   ├── role.schema.js       # Мапінг колонок Oracle (APP_ROLES)
│   │   ├── role.model.js        # Domain Entity з методами toJSON/toDatabase
│   │   ├── role.repository.js   # SQL запити та initializeSchema (Seeding)
│   │   ├── role.service.js      # Бізнес-логіка (validateRolesExist)
│   │   ├── role.controller.js   # Swagger анотації + HTTP обробка
│   │   ├── role.routes.js       # Клас маршрутів
│   │   ├── role.validation.js   # Zod схеми для ролей
│   │   └── role.module.js       # Точка збору (Composition Root)
│   ├── user/
│   │   ├── user.schema.js       # Мапінг APP_USERS + Pivot Table
│   │   ├── user.model.js        # Entity з підтримкою масиву roles
│   │   ├── user.repository.js   # Складні JOIN запити та syncRoles
│   │   ├── user.service.js      # Хешування паролів + крос-модульна логіка
│   │   ├── user.controller.js   # Swagger + управління профілем
│   │   ├── user.routes.js       # Маршрути користувача
│   │   ├── user.validation.js   # Zod схеми (email, password complexity)
│   │   └── user.module.js       # Ініціалізація з ін'єкцією RoleService
│   └── auth/
│       ├── auth.schema.js       # Таблиця сесій (APP_USER_SESSIONS)
│       ├── auth.token.js        # Сервіс на базі `jose` (RS256/JWKS)
│       ├── auth.repository.js   # Управління токенами в БД (Refresh Strategy)
│       ├── auth.service.js      # Логіка Login/Refresh/Logout/Validation
│       ├── auth.middleware.js   # Клас-захисник (verifyToken/checkRole)
│       ├── auth.controller.js   # Робота з Cookies та токенами
│       ├── auth.routes.js       # .well-known/jwks.json та Auth ендпоінти
│       ├── auth.validation.js   # Схеми для Login/Token Introspection
│       └── auth.module.js       # Асинхронна ініціалізація (Key Import)
└── app.js                       # Bootstrap проекту, ініціалізація пулу Oracle
