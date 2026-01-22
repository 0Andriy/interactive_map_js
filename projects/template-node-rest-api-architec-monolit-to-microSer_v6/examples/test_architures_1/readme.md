src/
├── core/
│   ├── entities/
│   │   └── User.js          # Бизнес-логика и структура данных
│   └── dto/
│       └── UserDTO.js       # Форматирование данных для API
├── infrastructure/
│   ├── OracleDatabaseService.js # Ваша обертка
│   └── OracleDatabaseManager.js # Ваш Registry менеджер
├── repositories/
│   ├── BaseRepository.js    # Базовая логика для всех репозиториев
│   └── UserRepository.js    # Специфические SQL запросы для Oracle
├── services/
│   └── UserService.js       # Координация работы (DI)
└── main.js                  # Composition Root (инициализация)


<!--  -->

src/
├── api/
│   ├── v1/                # Перша версія API
│   │   ├── controllers/
│   │   ├── dto/           # Специфічні формати для v1
│   │   └── routes.js      # Всі маршрути v1
│   └── v2/                # Нова версія API
│       ├── controllers/
│       ├── dto/           # Нові формати (напр. зміна полів)
│       └── routes.js
├── core/                  # Спільні сутності (Entities)
├── repositories/          # Спільна робота з Oracle
└── app.js                 # Підключення всіх версій



<!--  -->

src/
└── users/
    ├── domain/                    # Ядро: бізнес-логіка, не залежить від NestJS
    │   ├── entities/              # Доменні моделі (напр. user.entity.ts)
    │   ├── value-objects/         # Об'єкти-значення (напр. email.vo.ts)
    │   ├── repositories/          # ІНТЕРФЕЙСИ репозиторіїв
    │   └── events/                # Доменні події
    │
    ├── application/               # Сценарії використання (Use Cases)
    │   ├── commands/              # Команди (на зміну стану)
    │   ├── queries/               # Запити (на отримання даних)
    │   ├── dto/                   # Data Transfer Objects
    │   └── users.service.ts       # Координатор (Application Service)
    │
    ├── infrastructure/            # Деталі реалізації (зовнішній світ)
    │   ├── persistence/           # Робота з базою даних
    │   │   ├── typeorm/           # Або Prisma/Mongoose
    │   │   │   ├── entities/      # Схеми БД (можуть відрізнятися від domain entities)
    │   │   │   └── repositories/  # Реалізація інтерфейсів з domain/
    │   ├── adapters/              # Інтеграція з іншими сервісами (напр. Mailer)
    │   └── mappers/               # Перетворення між DB Entities та Domain Entities
    │
    ├── presentation/              # Точки входу (Interface Layer)
    │   ├── http/
    │   │   ├── users.controller.ts
    │   │   └── requests/          # Класи валідації запитів (class-validator)
    │   ├── grpc/                  # (Опційно) gRPC контролери
    │   └── cron/                  # (Опційно) заплановані задачі
    │
    └── users.module.ts            # Зв'язування всіх шарів через DI



<!--  -->


src/
├── users/
│   ├── dto/
│   │   ├── create-user.dto.ts      # Опис даних для створення
│   │   └── update-user.dto.ts      # Опис даних для оновлення
│   ├── entities/
│   │   └── user.entity.ts          # Модель бази даних (напр. TypeORM class)
│   ├── users.controller.ts         # Обробка HTTP запитів
│   ├── users.service.ts            # Бізнес-логіка та робота з БД
│   ├── users.module.ts             # Головний файл модуля
│   └── users.service.spec.ts       # Тести для сервісу
├── app.module.ts                   # Кореневий модуль
└── main.ts                         # Точка входу



<!--  -->


src/
├── controllers/          # Обробка HTTP (req, res)
│   └── user.controller.js
├── services/             # Бізнес-логіка (розрахунки, робота з БД)
│   └── user.service.js
├── models/               # Схеми бази даних (Mongoose, Sequelize)
│   └── user.model.js
├── routes/               # Опис маршрутів та прив'язка до контролерів
│   └── user.routes.js
├── middlewares/          # Auth, валідація, логування
│   └── auth.middleware.js
├── config/               # Конфігурація БД, змінні оточення
│   └── db.js
├── app.js                # Налаштування Express (middlwares, routes)
└── server.js             # Запуск сервера (listen)


<!--  -->



src/
├── modules/
│   ├── users/
│   │   ├── users.controller.js
│   │   ├── users.service.js
│   │   ├── users.routes.js
│   │   ├── users.model.js
│   │   └── dto/ (або validation/)
│   └── orders/
│       ├── orders.controller.js
│       └── ...
├── shared/               # Спільні речі для всіх модулів
│   └── middlewares/
├── app.js
└── server.js


<!--  -->

src/
├── config/
│   └── databases.js         # Ініціалізація OracleDatabaseManager
├── shared/
│   ├── OracleDatabaseManager.js
│   └── infrastructure/
│       └── message-broker.js # Клієнт для брокера повідомлень
├── middlewares/             # Глобальные обертки
│   └── auth.middleware.js   # Middleware для проверки JWT
├── modules/
│   └── users/
│       ├── dto/             # Zod схеми
│       │   └── create-user.dto.js
│       ├── entities/        # Доменні моделі
│       │   └── user.entity.js
│       ├── infrastructure/  # Адаптери (HTTP клієнти)
│       │   └── billing-api.client.js
│       ├── users.repository.js
│       ├── users.service.js
│       ├── users.controller.js
│       ├── users.routes.js
│       └── index.js         # Composition Root (DI Фабрика)
├── app.js                   # Налаштування Express
└── server.js                # Bootstrap (Запуск)

<!--  -->

src/
├── shared/
│   ├── OracleDatabaseManager.js  # Ваш менеджер баз
│   ├── TokenService.js           # Ваша обгортка для JWT
│   └── MessageBroker.js          # Клієнт RabbitMQ/Kafka
├── modules/
│   ├── auth/
│   │   ├── auth.service.js
│   │   ├── auth.controller.js
│   │   ├── auth.routes.js
│   │   └── index.js             # Фабрика модуля Auth
│   └── users/
│       ├── entities/
│       │   └── user.entity.js
│       ├── users.repository.js
│       ├── users.service.js
│       ├── index.js             # Фабрика модуля Users
├── app.js                       # Налаштування Express (Composition Root)
└── server.js                    # Bootstrap (Запуск)


<!--  -->

src/modules/users/
├── infrastructure/
│   └── inventory-api.client.js  # Клієнт для запитів до іншого мікросервісу
├── users.service.js
└── index.js

<!--  -->
