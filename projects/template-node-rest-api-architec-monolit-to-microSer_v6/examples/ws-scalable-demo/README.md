/ws-scalable-demo
├── app.js               # Точка входу, ініціалізація сервера та менеджера
├── package.json
└── src/                 # Директорія з логікою
    ├── brokers/
    │   ├── IMessageBroker.js # Інтерфейс (абстракція)
    │   └── LocalBroker.js    # Реалізація локального брокера
    ├── models/
    │   ├── Client.js
    │   └── Room.js
    └── Manager.js         # Основний клас управління (Mediator)



/ws-scalable-demo
├── app.js
├── package.json
└── src/
    ├── brokers/
    │   ├── IMessageBroker.js
    │   ├── LocalBroker.js    # Залишається для порівняння
    │   └── RedisBroker.js    # Нова, ефективна реалізація
    ├── models/
    │   ├── Client.js
    │   └── Room.js
    └── Manager.js         # Оновлений клас управління
