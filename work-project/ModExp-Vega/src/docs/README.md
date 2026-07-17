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

<!--  -->


/my-app
├── /public                # Статичні файли (те, що доступно ззовні)
│   ├── /site              # Стилі, картинки, клієнтський JS сайту
│   └── /api               # Документація або завантажені юзерами файли
├── /src
│   ├── /apps              # Вхідні точки (Entry points)
│   │   ├── api.js         # Налаштування Express для API
│   │   ├── web.js         # Налаштування Express для сайту (SSR)
│   │   └── websocket.js   # Налаштування Socket.io / ws
│   ├── /features          # Ядро системи (Вертикальні слайси)
│   │   ├── /products
│   │   │   ├── products.controller.js  # Для API
│   │   │   ├── products.page.js        # Для Веб-сайту
│   │   │   ├── products.service.js     # Бізнес-логіка (спільна)
│   │   │   └── /ui                     # Компоненти (шаблони) цієї фічі
│   │   └── /chat
│   │       ├── chat.socket.js          # Логіка сокетів
│   │       └── chat.service.js
│   ├── /shared            # Те, що використовують всі фічі
│   │   ├── /ui            # Глобальні компоненти (Layout, Button, Footer)
│   │   ├── /db            # Підключення до БД (Prisma, Mongoose тощо)
│   │   └── /middleware    # Спільні перевірки (auth, logger)
│   └── main.js            # Головний файл, що запускає все разом
├── .env
├── package.json
└── README.md


/my-app
├── /apps                  # Точки входу для різних частин системи
│   ├── /api               # Екземпляр Express/Fastify для API
│   │   └── server.js      # Ініціалізація API
│   ├── /web               # Екземпляр для рендерингу сайту (SSR)
│   │   └── server.js
│   └── /ws                # Обробка WebSocket з'єднань
├── /features              # Гібридна логіка (Feature-based)
│   ├── /auth              # Функціонал авторизації
│   │   ├── /api           # Роути та контролери API
│   │   ├── /web           # Сторінки (Login, Register) та UI-компоненти
│   │   ├── /ws            # Події сокетів для авторизації
│   │   ├── /services      # Спільна бізнес-логіка (shared)
│   │   └── index.js       # Публічний інтерфейс фічі
│   └── /chat              # Приклад фічі з сокетами
│       ├── /api
│       ├── /ws            # Логіка чату через сокети
│       └── components/    # Перевикористовувані UI-елементи
├── /shared                # Спільний код (валідація, константи, БД)
│   ├── /components        # Базові UI елементи (Buttons, Inputs)
│   ├── /db                # Клієнт бази даних
│   └── /utils
├── /public                # Статичні файли
│   ├── /api               # Документація (Swagger), завантажені файли API
│   └── /web               # CSS, клієнтський JS, картинки сайту
├── package.json
└── index.js               # Головний запуск в режимі моноліту


<!--  -->
<!-- https://oneuptime.com/blog/post/2026-02-03-nodejs-large-app-structure/view -->
<!-- src/
  modules/
    users/
      user.controller.ts
      user.service.ts
      user.repository.ts
      user.model.ts
      user.routes.ts
      user.validation.ts
      user.types.ts
      __tests__/
        user.service.test.ts
        user.controller.test.ts
    orders/
      order.controller.ts
      order.service.ts
      order.repository.ts
      order.model.ts
      order.routes.ts
      order.validation.ts
      order.types.ts
      __tests__/
    products/
      ...
  shared/
    middleware/
    utils/
    types/
  config/
  index.ts -->



<!--  -->


my-app/
├── config/
│   ├── oracle.js
│   └── cors.js              # Заготовка для налаштування CORS у майбутньому
├── src/
│   ├── app.routes.js        # Головний збирач маршрутів
│   │
│   ├── modules/             # Чистий БЕКЕНД (Бізнес-логіка, Моделі, API)
│   │   ├── auth/
│   │   │   ├── auth.api.controller.js # Тільки JSON відповіді
│   │   │   ├── auth.service.js
│   │   │   ├── auth.model.js
│   │   │   ├── auth.guard.js
│   │   │   └── auth.routes.js         # Шляхи виду /api/v1/auth/...
│   │   │
│   │   ├── user/
│   │   │   ├── user.api.controller.js # Тільки JSON відповіді
│   │   │   ├── user.service.js
│   │   │   ├── user.model.js
│   │   │   └── user.routes.js         # Шляхи виду /api/v1/users/...
│   │
│   │
│   │   /* ========================================================
│   │      ВСЕ, ЩО НИЖЧЕ – ЦЕ ТИМЧАСОВИЙ ШАР ДЛЯ ПОТОЧНОГО EJS.
│   │      КОЛИ ФРОНТЕНД СТАНЕ ОКРЕМИМ, ЦІ ПАПКИ ПРОСТО ВИДАЛЯЮТЬСЯ
│   │      ======================================================== */
│   │
│   ├── web-monolith/        # Вся логіка поточного веб-інтерфейсу
│   │   ├── controllers/     # Тонкі веб-контролери (лише викликають сервіси з modules/ і рендерять EJS)
│   │   │   ├── auth.web.controller.js
│   │   │   └── user.web.controller.js
│   │   ├── middleware/      # Мідлвари для браузера (наприклад, редірект на /login)
│   │   │   └── web.guard.js
│   │   └── web.routes.js    # Шляхи для браузера (/, /login, /dashboard)
│   │
│   └── views/               # Шаблони EJS (Чистий HTML/UI)
│       ├── components/
│       ├── layouts/
│       └── pages/
│
├── public/                  # Статичні файли (зараз для EJS, потім видалиться)
├── server.js
└── package.json
