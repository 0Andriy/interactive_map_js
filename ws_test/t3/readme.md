├── src/
│   ├── adapters/
│   │   ├── BaseAdapter.js     # Абстрактний інтерфейс адаптера
│   │   └── RedisAdapter.js    # Масштабований Redis адаптер (з DI та аггрегацією)
│   ├── EventBus.js            # Легка шина подій (Pub/Sub)
│   ├── Socket.js              # Обгортка WS-з'єднання з івентами життєвого циклу
│   ├── Namespace.js           # Ізольований простір (Middleware + Кімнати)
│   ├── IoServer.js            # Головний оркестратор сервера
│   └── di.js                  # Складання системи через Dependency Injection
└── server.js                  # Точка входу та бізнес-логіка
