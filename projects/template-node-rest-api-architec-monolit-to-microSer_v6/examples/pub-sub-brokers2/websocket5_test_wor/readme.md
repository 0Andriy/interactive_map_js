src/
├── interfaces/
│   ├── IStateAdapter.js    # Контракт сховища стану
│   ├── IBrokerAdapter.js   # Контракт шини подій
│   └── ILogger.js          # Контракт системи логування
├── core/
│   ├── Connection.js       # Обгортка над сирим WebSocket
│   ├── Room.js             # Логіка кімнати (Proxy до стану)
│   ├── Namespace.js        # Базовий клас ізольованого простору
│   └── SocketServer.js     # Диспетчер з'єднань (Entry Point)
├── adapters/
│   ├── MemoryStateAdapter.js   # Локальна реалізація стану
│   └── MemoryBrokerAdapter.js  # Локальна реалізація брокера
└── namespaces/
    └── ChatNamespace.js    # Приклад бізнес-логіки

app.js                      # Composition Root (Збірка системи)


<!--  -->


src/
├── interfaces/         # Тільки контракти (класи з throw Error)
├── core/               # Ядро (Connection, Room, Namespace, Server)
├── adapters/
│   ├── state/          # Реалізації IStateAdapter (MemoryState, RedisState)
│   └── broker/         # Реалізації IBrokerAdapter (MemoryBroker, RedisBroker)
├── factories/          # Фабрика для створення адаптерів
└── namespaces/         # Бізнес-логіка
app.js                  # Composition Root


<!--  -->


project/
├── src/
│   ├── interfaces/
│   │   ├── IStateAdapter.js
│   │   ├── IBrokerAdapter.js
│   │   └── ILogger.js
│   ├── core/
│   │   ├── Connection.js
│   │   ├── Room.js
│   │   ├── Namespace.js
│   │   └── SocketServer.js
│   ├── adapters/
│   │   ├── state/
│   │   │   ├── MemoryStateAdapter.js
│   │   │   └── RedisStateAdapter.js
│   │   └── broker/
│   │       ├── MemoryBrokerAdapter.js
│   │       └── RedisBrokerAdapter.js
│   ├── factories/
│   │   └── StateFactory.js   # Створює Memory чи Redis State
│   │   └── BrokerFactory.js  # Створює Memory чи Rabbit/Redis Broker
│   └── namespaces/
│       └── ChatNamespace.js
├── app.js
└── package.json


<!--  -->
