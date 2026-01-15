/
├── .github/workflows/       # CI/CD (GitHub Actions)
├── migrations/              # Liquibase або Knex SQL файли для Oracle
├── src/
│   ├── config/              # Конфігурація (Oracle, S3, JWT, Redis)
│   │   ├── database.ts
│   │   └── s3.config.ts
│   ├── common/              # Спільний код для всіх модулів
│   │   ├── errors/          # Custom App Errors
│   │   ├── middleware/      # Auth, Logging, Rate-limiting
│   │   └── utils/           # Streams, Crypto
│   ├── modules/             # Бізнес-модулі
│   │   ├── auth/            # Модуль авторизації
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.repository.ts
│   │   │   └── auth.schemas.ts
│   │   ├── users/           # Модуль користувачів
│   │   │   ├── users.controller.ts
│   │   │   ├── users.service.ts
│   │   │   └── users.repository.ts
│   │   ├── roles/           # Модуль RBAC (права доступу)
│   │   │   └── roles.service.ts
│   │   └── files/           # Модуль файлової системи
│   │       ├── files.controller.ts # API ендпоінти
│   │       ├── files.service.ts    # Оркестрація (S3 + DB)
│   │       ├── files.repository.ts # Робота з Oracle
│   │       ├── files.websocket.ts  # Обробка WS подій
│   │       └── providers/          # S3/Local Storage Logic
│   ├── infrastructure/      # Зовнішні сервіси
│   │   ├── s3.client.ts
│   │   ├── oracle.client.ts # Пул з'єднань node-oracledb
│   │   └── redis.client.ts  # Для WS Pub/Sub
│   ├── app.ts               # Реєстрація плагінів Fastify та маршрутів
│   └── server.ts            # Entry point (Bootstrap)
├── tests/                   # E2E та Unit тести
├── package.json             # "type": "module" обов'язково
└── tsconfig.json


<!--  -->


/project-root
├── prisma/                          # Або migrations/ (Liquibase для Oracle)
│   └── schema.prisma                # Схема БД
├── src/
│   ├── main.ts                      # Точка збору (Composition Root)
│   ├── core/                        # --- ШАР БІЗНЕС-ЛОГІКИ (Domain) ---
│   │   ├── entities/                # Моделі даних (User.ts, File.ts)
│   │   ├── use-cases/               # Бізнес-сценарії (незалежні від фреймворків)
│   │   │   ├── files/
│   │   │   │   ├── upload-file.v1.ts
│   │   │   │   └── upload-file.v2.ts # Нова логіка завантаження
│   │   │   └── auth/
│   │   └── interfaces/              # Абстракції (IFileRepo, IQueue, IMailer)
│   │
│   ├── interface-adapters/          # --- ШАР АДАПТЕРІВ ---
│   │   ├── controllers/             # Перетворюють HTTP/WS у Use Cases
│   │   │   ├── v1/
│   │   │   │   └── file.controller.ts
│   │   │   └── v2/
│   │   │       └── file.controller.ts
│   │   ├── repositories/            # Реалізація доступу до Oracle
│   │   │   └── oracle-file.repo.ts
│   │   └── presenters/              # Форматування відповідей
│   │
│   ├── infrastructure/              # --- ШАР ІНФРАСТРУКТУРИ (Frameworks) ---
│   │   ├── webserver/               # Налаштування Express
│   │   │   ├── express-app.ts
│   │   │   ├── v1-routes.ts
│   │   │   └── v2-routes.ts
│   │   ├── websocket/               # Налаштування WebSockets (Custom/ws)
│   │   │   ├── ws-server.ts         # Обробка підключень
│   │   │   ├── v1-handlers.ts       # Логіка повідомлень версії 1
│   │   │   └── v2-handlers.ts       # Логіка повідомлень версії 2
│   │   └── db/
│   │       └── oracle-client.ts     # Налаштування node-oracledb
│   │
│   └── shared/                      # Спільні утиліти, Zod-схеми, типи
├── .env
├── package.json (type: module)
└── tsconfig.json

<!--  -->


