/microservices-root
  ├── auth-service/       # Порт 3001 (JWT, Login)
  ├── user-service/       # Порт 3002 (DB Users)
  ├── ws-service/         # Порт 3003 (Socket.io, Real-time)
  └── shared/             # Спільні утиліти та RabbitMQ клієнт

<!--  -->


auth-service/
  ├── src/
  │   ├── modules/
  │   │   └── auth/
  │   │       ├── auth.controller.js  # Обробка HTTP
  │   │       ├── auth.service.js     # Бізнес-логіка
  │   │       └── auth.module.js      # Ініціалізація та зв'язки
  │   ├── shared/
  │   │   └── rabbitmq.js             # Message Broker
  │   └── main.js                     # Точка входу (аналог main.ts)
  └── package.json

<!--  -->



/microservices-root
  ├── auth-service/           # Порт 3001 (Керує сесіями)
  │   ├── src/
  │   │   ├── config/         # Конфігурація (env)
  │   │   ├── infrastructure/ # БД (Oracle), Токени (Jose), HTTP-клієнти
  │   │   ├── modules/        # Бізнес-логіка (Auth)
  │   │   └── main.js         # Точка входу
  ├── user-service/           # Порт 3002 (Керує профілями)
  └── ws-service/             # Порт 3003 (Socket.io)

<!--  -->


auth-service/
  ├── src/
  │   ├── common/
  │   │   ├── middlewares/      # Глобальні мідлвайри (auth.guard, logger)
  │   │   │   └── auth.guard.js
  │   │   └── errors/           # Обробка помилок
  │   ├── modules/
  │   │   └── auth/
  │   │       ├── auth.controller.js # Тільки методи (req, res)
  │   │       ├── auth.service.js    # Бізнес-логіка
  │   │       ├── auth.routes.js     # ВИДІЛЕНО: Опис шляхів та мідлвайрів
  │   │       └── auth.module.js     # Збірка (DI)
  │   └── main.js


<!--  -->


