#test

project/
├── src/
│   ├── interfaces/          # Контракты (Абстрактные классы)
│   │   ├── StateAdapter.js
│   │   ├── BrokerAdapter.js
│   │   └── Logger.js
│   ├── core/                # Бизнес-логика (ядро системы)
│   │   ├── Socket.js
│   │   ├── PubSub.js        # Управление подписками
│   │   ├── MessageEnvelope.js
│   │   ├── Room.js
│   │   ├── Namespace.js
│   │   └── Server.js
│   ├── adapters/            # Реализации интерфейсов
│   │   ├── state/
│   │   │   ├── MemoryStateAdapter.js
│   │   │   └── RedisStateAdapter.js
│   │   └── broker/
│   │       ├── MemoryBrokerAdapter.js
│   │       └── RedisBrokerAdapter.js
│   ├── factories/           # Инстанцирование с учетом окружения
│   │   ├── StateFactory.js
│   │   └── BrokerFactory.js
│   ├── constants/           # Системные константы и Enum-подобные объекты
│   │   └── events.js
│   └── errors/              # Кастомная иерархия ошибок
│       └── BaseError.js
├── app.js                   # Точка входа (Composition Root)
└── package.json
