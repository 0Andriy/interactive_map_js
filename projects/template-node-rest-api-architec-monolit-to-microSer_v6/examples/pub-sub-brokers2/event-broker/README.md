src/
├── services/
│   ├── event-broker/
│   │   ├── interfaces/
│   │   │   └── EventBrokerInterface.js  // Абстрактний клас/контракт
│   │   ├── implementations/
│   │   │   ├── LocalPubSub.js           // Локальна реалізація
│   │   │   └── RedisPubSubAdapter.js    // Реалізація для Redis
│   │   ├── EventBrokerFactory.js        // Фабрика для вибору реалізації
│   │   └── index.js                     // Експорт та, можливо, ініціалізація
│   ├── UserService.js                   // Компоненти, які використовують брокер
│   └── MailService.js                   // Компоненти, які використовують брокер
├── config/
│   └── app.js                           // Файл конфігурації вибору реалізації
└── main.js                              // Точка входу програми
