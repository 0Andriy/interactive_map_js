src/
├── config/                 # Єдине місце для всіх налаштувань
│   ├── index.js            # Агрегатор конфігів
│   ├── database.config.js  # Налаштування БД
│   ├── jwt.config.js       # Налаштування всіх типів токенів
│   └── database.config.js  # Налаштування (host, user, tns)
├── core/                       # Ядро системи (shared інфраструктура)
│   ├── jwt/
│   │   ├── jwt.service.js      # Базовий клас для роботи з jose
│   │   ├── token-registry.js   # Єдине джерело правди (типи та конфіги)
│   │   └── key-resolver.js     # Стратегія отримання ключів
│   ├── database/
│   │   ├── oracle.service.js  # Обгортка над node-oracledb
│   │   └── connection-manager.js # Реєстр паралельних підключень
│   ├── broker/
│   │   └── message-broker.js   # Клієнт для RabbitMQ/Kafka
│   └── middleware/
│       └── auth.middleware.js  # Спільний захист для всіх модулів
├── modules/
│   ├── auth/                   # Модуль авторизації (Issuer)
│   │   ├── providers/
│   │   │   └── user.provider.js # Міст до модуля Users
│   │   ├── subscribers/       # Слухачі подій від інших модулів
│   │   │    └── user-updated.consumer.js
│   │   ├── auth.manager.js     # Фасад (access/refresh інстанси)
│   │   ├── auth.service.js     # Бізнес-логіка (login/logout)
│   │   └── auth.controller.js
│   ├── users/                  # Модуль користувачів
│   │   ├── users.service.js
│   │   └── users.repository.js
│   └── products/               # Модуль товарів (споживач токенів)
│       └── products.controller.js
└── app.js                      # Ініціалізація Express

<!--  -->

src/
├── common/
│   └── event-bus.js       # Класс EventBus (Singleton)
├── modules/
│   ├── user-client/       # Модуль взаимодействия с внешним микросервисом
│   │   ├── user.client.js # Service (HTTP запросы)
│   │   └── user.module.js # Сборщик модуля
│   └── auth/
│       ├── models/        # Описание структур данных
│       ├── auth.repo.js   # Repository (работа с локальной БД, если нужна)
│       ├── auth.service.js# Service (бизнес-логика)
│       ├── auth.ctrl.js   # Controller (обработка req/res)
│       ├── auth.router.js # Router (определение путей)
│       └── auth.module.js # Сборщик модуля (DI инициализация)
└── main.js                # Точка входа (Composition Root)


<!--  -->
