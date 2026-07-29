src/
├── core/
│   ├── EventBus.js       # Базовий клас для подій (EventEmitter)
│   ├── Server.js         # Головний сервер (аналог io)
│   ├── Namespace.js      # Керування кімнатами та логікою груп
│   └── Socket.js         # Обгортка навколо базового ws-з'єднання
├── adapters/
│   ├── BaseAdapter.js    # Інтерфейс для масштабування
│   └── MemoryAdapter.js  # Дефолтний локальний адаптер
└── extensions/
    ├── Heartbeat.js      # Плагін для пінгу/понгу
    └── AckManager.js     # Плагін для підтвердження доставки
