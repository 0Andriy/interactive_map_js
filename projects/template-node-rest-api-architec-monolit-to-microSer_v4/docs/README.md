# Архітектура Проєкту: Моноліт з Легким Перехідом на Мікросервіси

Цей проєкт організований таким чином, щоб на старті працювати як моноліт, але при цьому структура дозволяє з мінімальними змінами перейти до мікросервісної архітектури.

---

## Загальна структура

```plaintext
project-root/
├── .vscode/                        # Налаштування середовища розробки (VS Code)
├── bin/                            # Стороні залежності (бінарніки) - Oracle Instant Client...
├── certs/                          # Сертифікати та ключі (не має попасти в git)
├── docs/                           # Загальна документація (архітектура, діаграми, специфікації)
│ │ ├── README.md                   # Головне інтро (як працює вся система)
│ │ ├── architecture.md             # Архітектурна документація
│ │ ├── database.md                 # Опис структури БД, таблиць, міграцій
│ │ ├── websocket.md                # WS API, обробники, протоколи
│ │ └── microservices/
│ │     ├── user.service.md
│ │     ├── auth.service.md
│ │     └── ws.service.md
├── public/                         # Файли для загального доступу зовні без захисту(з інтернету)
├── src/
│ ├── api/                          # HTTP REST API з підтримкою версіювання
│ │ ├── v1/                         # Версія 1 API
│ │ │ ├── controllers/              # Обробники HTTP-запитів
│ │ │ ├── gateways/                 # Абстракції доступу до зовнішніх сервісів (напр. user.service для auth)  (або папка clients)
│ │ │ ├── models/                   # Моделі бази даних (ORM/ODM, напр. Sequelize, Mongoose)
│ │ │ ├── repositories/             # Логіка роботи з базою даних
│ │ │ ├── routes/                   # Шляхи (роути) HTTP API
│ │ │ ├── validations/              # Схеми валідації (Joi, Zod, Yup)
│ │ │ └── services/                 # Бізнес-логіка (core)
│ │ │
│ │ └── v2/                         # Версія 2 API (для майбутніх оновлень)
│ │
│ ├── broker/
│ │ ├── index.js                    # Ініціалізація брокера (RabbitMQ, Kafka)
│ │ ├── producers/                  # Відправники
│ │ │   └── user.producer.js
│ │ ├── consumers/                  # Приймачі
│ │ │   └── auth.consumer.js
│ │ └── utils.js                    # Допоміжні функції (наприклад, reconnect)
│ │
│ ├── config/                       # Конфігурації для різних середовищ і сервісів
│ │
│ ├── db/                           # Логіка підключення та управління базою даних
│ │ └── oracledb-connection.js      # Пул з'єднань, ініціалізація OracleDB
│ │
│ ├── middlewares/                  # Посередники Express (валідації, обробка помилок тощо)
│ ├── utils/                        # Утиліти, загальні функції
│ │
│ ├── ws/                           # Вебсокети (окрема логіка, готова до масштабування)
│ │ ├── server.js                   # Ініціалізація WebSocket сервера
│ │ ├── handlers/                   # Обробники подій WS (connect, message, disconnect)
│ │ ├── services/                   # WS бізнес-логіка (окрема від REST)
│ │ └── utils/                      # Допоміжні функції для WS
│ │
│ ├── app.js                        # Ініціалізація Express + маршрути API
│ └── server.js                     # Старт сервера, ініціалізація DB, WS
│
├── .env                            # Змінні оточення (ключі, паролі, налаштування)
├── package.json                    # NPM залежності та скрипти
└── README.md                       # Кореневий файл — загальна інструкція по запуску

```

Або

```plaintext
src/
├── modules/                        # Нова директорія для доменних модулів
│ ├── auth/
│ │ ├── auth.controller.js
│ │ ├── auth.service.js
│ │ ├── auth.repository.js          (якщо є своя логіка доступу до даних)
│ │ ├── auth.model.js               (якщо є своя модель)
│ │ ├── auth.routes.js              (або інтегрувати роути в контролер)
│ │ └── auth.module.js              (файл, що експортує всі компоненти модуля, як в Nest)
│ ├── user/
│ │ ├── user.controller.js
│ │ ├── user.service.js
│ │ ├── user.repository.js
│ │ ├── user.model.js
│ │ ├── user.routes.js
│ │ └── user.module.js
│ └── products/
│     ├── product.controller.js
│     ├── product.service.js
│     └── product.module.js
│
├── shared/                         # Загальні компоненти, які використовуються багатьма модулями
│ ├── middlewares/
│ ├── utils/
│ ├── config/
│ ├── db/
│ └── broker/                       (якщо брокер універсальний для всіх сервісів)
│
├── ws/                             # Якщо WS є окремим "сервісом" зі своєю логікою
│ ├── ws.server.js
│ └── ws.handlers.js
│
├── app.js                          # Основний файл, що імпортує та ініціалізує модулі
└── server.js
```

Або - Модульний Моноліт: Архітектура з Прицілом на Мікросервіси

```plaintext
your-scalable-app/
├── config/
│   ├── default.js                          # Загальна конфігурація додатка
│   └── environments/                       # Конфігурації для різних середовищ (розробка, продакшн)
│       ├── development.js
│       └── production.js
├── logs/                                   # Папка для файлів логів
├── src/
│   ├── app.js                              # Основний файл Express-додатка, ініціалізація, загальні middleware
│   ├── modules/                            # Папка для бізнес-модулів (майбутніх мікросервісів)
│   │   ├── auth/                           # Модуль автентифікації
│   │   │   ├── controllers/
│   │   │   │   ├── v1/auth.controller.js   # Контролер для v1
│   │   │   │   └── v2/auth.controller.js   # Контролер для v2 (якщо відрізняється)
│   │   │   ├── services/auth.service.js
│   │   │   ├── repositories/...            # Для токенів, сесій, тощо
│   │   │   ├── models/Token.js             # Модель, якщо потрібна (наприклад, для refresh-токенів)
│   │   │   ├── routes/...
│   │   │   └── auth.module.js              # Файл для реєстрації модуля в моноліті
│   │   │
│   │   ├── user/                           # Модуль користувачів
│   │   │   ├── controllers/...
│   │   │   ├── services/...
│   │   │   ├── repositories/..
│   │   │   ├── models/...                  # Модель користувача
│   │   │   ├── routes/...
│   │   │   └── user.module.js              # Файл для реєстрації модуля в моноліті
│   │   │
│   │   └── product/                        # Інший приклад модуля
│   │       ├── controllers/...
│   │       ├── services/...
│   │       ├── repositories/...
│   │       ├── models/...
│   │       ├── routes/...
│   │       └── product.module.js
│   │
│   ├── shared/                             # Спільні компоненти для всіх модулів
│   │   ├── middlewares/                    # Загальні middleware (логування, обробка помилок, CORS, парсинг тіла)
│   │   │   ├── requestLogger.js
│   │   │   ├── errorHandler.js
│   │   │   └── authMiddleware.js           # Загальний middleware для перевірки JWT/сесії
│   │   ├── utils/                          # Загальні утиліти (хешування, валідація, інструменти БД)
│   │   │   ├── logger/                     # Ваша структура логера, як ми обговорювали
│   │   │   │   ├── ILogger.js
│   │   │   │   ├── ConsoleLogger.js
│   │   │   │   ├── WinstonLogger.js
│   │   │   │   ├── LoggerFactory.js
│   │   │   │   └── index.js                # Основний експорт логера
│   │   │   ├── database/                   # Загальний менеджер з'єднань БД (якщо єдина БД)
│   │   │   │   ├── DatabaseConnectionManager.js
│   │   │   │   └── databaseContext.js      # Для AsyncLocalStorage, якщо потрібно
│   │   │   └── jwtUtils.js                 # Утиліти для роботи з JWT (створення/валідація)
│   │   ├── adapters/                       # Для зовнішніх інтеграцій (платіжні системи, SMS, email)
│   │   │   └── emailServiceAdapter.js
│   │   └── types/                          # Загальні TypeScript типи або JSDoc typedefs
│   │
│   └── index.js                            # Точка входу в додаток (ініціалізація та запуск app.js)
│
├── .env                                    # Змінні середовища
├── .gitignore
├── package.json
├── jsdoc.json
```

---

## Пояснення ключових компонентів

### 1. `src/api/v{N}/`

-   Містить **версії API**.
-   Кожна версія має свій набір контролерів, маршрутів, сервісів, репозиторіїв і gateway.
-   **Gateway** — абстракції для доступу до інших сервісів (напр. `UserGateway` для auth).
-   Легко додавати нові версії, зберігаючи підтримку старих.

---

### 2. `src/ws/`

-   Вебсокети ізольовані від HTTP API.
-   Містить свій сервер, обробники подій і бізнес-логіку.
-   Легко вивести у окремий сервіс при переході на мікросервіси.
-   Можна масштабувати через Redis Pub/Sub або інші брокери повідомлень.

---

### 3. `src/db/`

-   Вся логіка підключення і керування базою даних (наприклад, пул орaкл клієнтів).
-   Репозиторії звертаються до цього шару для отримання з’єднань.
-   Ізольовано від бізнес-логіки.

---

### 4. `src/middlewares/`

-   Посередники Express: авторизація, логування, обробка помилок.
-   Використовуються в усіх версіях API.

---

### 5. `src/config/`

-   Конфігурації для сервера, бази даних, JWT, зовнішніх сервісів.
-   Підтримка різних середовищ: development, staging, production.
-   Кожен мікросервіс буде мати свій власний конфіг, легко налаштовується через `.env`.

---

### 6. `src/app.js` та `src/server.js`

-   `app.js` — ініціалізація Express, маршрути API (версії), middlewares.
-   `server.js` — запуск HTTP і WS серверів, ініціалізація підключень до бази даних.
-   Розділення логіки дозволяє легко замінити окремі частини або винести у мікросервіси.

---

## Як це допомагає перейти на мікросервіси?

-   **Версії API** вже розділені за папками, можна просто скопіювати потрібну версію у новий сервіс.
-   **Gateway** інкапсулюють зовнішні залежності — змінюється лише gateway, а сервіси, які його викликають, залишаються без змін.
-   Вебсокети виділені окремо, тому їх можна винести в `ws-service`.
-   Конфігурації налаштовуються індивідуально для кожного сервісу.
-   Репозиторії ізольовані від сервісів і бізнес-логіки, легко замінюються/оновлюються.

---

## Додаткові рекомендації

-   Використовуй стандарти REST і HTTP коди відповідей.
-   Пиши unit тести для кожного шару (сервіси, репозиторії, gateway).
-   Документуй API, наприклад, за допомогою Swagger/OpenAPI.
-   Використовуй контейнеризацію (Docker) для локальної розробки і деплою.
-   Реалізуй централізоване логування і моніторинг.

---

# HTTP long-polling

HTTP long-polling (довге опитування) – це техніка, яка використовується для імітації "push"-повідомлень від сервера до клієнта через звичайний протокол HTTP, який за своєю природою є "pull"-орієнтованим (клієнт запитує дані).

## Ось як це працює:

1. Клієнт відправляє запит: Замість того, щоб просто запитувати дані і очікувати негайної відповіді, клієнт (наприклад, веб-браузер) відправляє HTTP GET-запит до сервера.
2. Сервер утримує з'єднання: Якщо у сервера немає нових даних для клієнта на момент отримання запиту, він не закриває з'єднання відразу. Натомість, він тримає це з'єднання відкритим протягом певного часу (таймауту) або доти, доки не з'являться нові дані.
3. Сервер відповідає, коли є дані: Коли на сервері з'являються нові дані (наприклад, нове повідомлення в чаті, оновлення стрічки новин, нове сповіщення), сервер негайно відправляє відповідь на відкритий запит клієнта, передаючи ці дані.
4. Клієнт отримує відповідь і відправляє новий запит: Як тільки клієнт отримує відповідь від сервера, він обробляє отримані дані, а потім негайно відправляє новий HTTP GET-запит, починаючи цикл знову.

## Основні відмінності від звичайного "polling" (опитування):

-   Звичайний polling: Клієнт регулярно (наприклад, кожні 5 секунд) відправляє запит на сервер, незалежно від того, чи є нові дані. Якщо даних немає, сервер відповідає порожнім результатом, і клієнт чекає наступного інтервалу. Це може призвести до надлишкових запитів і навантаження на сервер.
-   Long-polling: Клієнт відправляє запит, і сервер тримає його відкритим, поки не з'являться дані. Це дозволяє отримувати оновлення практично в реальному часі, без необхідності частих порожніх запитів.

## Переваги HTTP Long-Polling:

-   Простота реалізації: Використовує стандартні HTTP-запити, що робить його відносно простим у реалізації як на стороні клієнта, так і на стороні сервера. Не потребує спеціальних протоколів, як WebSockets.
-   Майже в реальному часі: Забезпечує доставку даних з мінімальними затримками, оскільки сервер відповідає, як тільки дані стають доступними.
-   Сумісність: Працює з усіма сучасними браузерами, оскільки базується на стандартних можливостях HTTP.
-   Обхід обмежень файрволів/проксі: Оскільки це звичайні HTTP-запити, вони, як правило, не блокуються файрволами або проксі-серверами, на відміну від WebSockets, які іноді можуть бути заблоковані в корпоративних мережах.

## Недоліки HTTP Long-Polling:

-   Навантаження на сервер: Хоча краще, ніж звичайний polling, все одно може створювати значне навантаження на сервер при великій кількості одночасних клієнтів, оскільки кожен клієнт тримає відкрите з'єднання.
-   Таймаути: Серверу необхідно встановлювати таймаути для запитів, щоб уникнути необмеженого тримання з'єднань, що може призвести до невеликих затримок, якщо дані з'являються відразу після закриття з'єднання через таймаут.
-   Накладні витрати HTTP: Кожен "довгий" запит все ще є повним HTTP-запитом зі своїми заголовками, що збільшує накладні витрати порівняно з більш оптимізованими протоколами (наприклад, WebSockets).

## Використання:

HTTP long-polling часто використовується в сценаріях, де потрібні оновлення в реальному часі, але не потрібна двонаправлена комунікація з низькою затримкою, як у випадку з чатами або іграми. Приклади включають:

-   Системи сповіщень.
-   Оновлення стрічок новин.
-   Прості чати (хоча WebSockets краще для повноцінних чатів).

Загалом, HTTP long-polling є ефективним компромісом між простотою реалізації та потребою в "push"-функціоналі в HTTP-середовищі.

## Example

```js
// server.js

import express from 'express'
import cors from 'cors'

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors()) // Дозволяє CORS запити, корисно для розробки
app.use(express.json()) // Дозволяє обробляти JSON-тіла запитів

// Масив для зберігання підписників (об'єктів response), які очікують на дані
const subscribers = new Set()
let messageIdCounter = 0 // Для унікальних ID повідомлень

// Функція для додавання нових повідомлень та сповіщення підписників
const addMessage = (text) => {
    const message = {
        id: ++messageIdCounter,
        text,
        timestamp: new Date().toISOString(),
    }

    console.log(`[Сервер] Нове повідомлення: ${JSON.stringify(message)}`)

    // Сповіщаємо всіх підписників
    for (const res of subscribers) {
        res.status(200).json(message)
        subscribers.delete(res) // Видаляємо підписника після відправки відповіді
    }
}

// --- Ендпоінт для Long-Polling ---
app.get('/subscribe', (req, res) => {
    // Встановлюємо заголовки, щоб клієнт не кешував відповідь
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')

    // Додаємо об'єкт response до списку підписників
    subscribers.add(res)

    console.log(`[Сервер] Новий підписник. Загалом: ${subscribers.size}`)

    // Обробка відключення клієнта (наприклад, закриття вкладки браузера)
    req.on('close', () => {
        subscribers.delete(res)
        console.log(`[Сервер] Підписник відключився. Залишилось: ${subscribers.size}`)
    })

    // Встановлюємо таймаут для запиту. Якщо за цей час не буде даних,
    // сервер відправить порожню відповідь, і клієнт зробить новий запит.
    // Це важливо для запобігання зависання з'єднань і для обробки мережевих проблем.
    const timeout = setTimeout(() => {
        if (subscribers.has(res)) {
            res.status(200).json({ message: 'No new data, please re-poll.' })
            subscribers.delete(res)
            console.log(`[Сервер] Відповідь по таймауту. Залишилось: ${subscribers.size}`)
        }
    }, 20000) // Таймаут 20 секунд

    // Очищаємо таймаут, якщо відповідь вже була відправлена
    res.on('finish', () => {
        clearTimeout(timeout)
    })
})

// --- Ендпоінт для відправки повідомлень (імітуємо джерело подій) ---
app.post('/publish', (req, res) => {
    const { message } = req.body
    if (message) {
        addMessage(message)
        res.status(200).json({ status: 'Message sent', message })
    } else {
        res.status(400).json({ error: 'Message is required' })
    }
})

// Додамо ендпоінт для кореневого URL, щоб перевірити роботу сервера
app.get('/', (req, res) => {
    res.send(
        'HTTP Long-Polling Server is running. Use /subscribe for polling and /publish to send messages.',
    )
})

app.listen(PORT, () => {
    console.log(`Сервер Long-Polling слухає на http://localhost:${PORT}`)
})

// Приклад: Імітуємо автоматичне додавання повідомлень кожні 5 секунд
setInterval(() => {
    addMessage(`Автоматичне повідомлення: ${new Date().toLocaleTimeString()}`)
}, 5000)
```

```html
// index.html

<!DOCTYPE html>
<html lang="uk">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Long-Polling Клієнт</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                margin: 20px;
            }
            #messages {
                border: 1px solid #ccc;
                padding: 10px;
                min-height: 200px;
                max-height: 400px;
                overflow-y: auto;
                margin-bottom: 10px;
            }
            .message-item {
                background-color: #f0f0f0;
                margin-bottom: 5px;
                padding: 5px;
                border-radius: 3px;
            }
            input[type='text'] {
                width: 300px;
                padding: 8px;
                margin-right: 5px;
            }
            button {
                padding: 8px 15px;
                cursor: pointer;
            }
        </style>
    </head>
    <body>
        <h1>Long-Polling Приклад</h1>

        <div>
            <input type="text" id="messageInput" placeholder="Введіть повідомлення для сервера" />
            <button id="sendMessageBtn">Надіслати повідомлення</button>
        </div>

        <h2>Отримані повідомлення:</h2>
        <div id="messages"></div>

        <script>
            const messagesDiv = document.getElementById('messages')
            const messageInput = document.getElementById('messageInput')
            const sendMessageBtn = document.getElementById('sendMessageBtn')

            const SERVER_URL = 'http://localhost:3000' // Переконайтеся, що порт співпадає з вашим сервером

            // Функція для додавання повідомлення до DOM
            const addMessageToDOM = (message) => {
                const messageElement = document.createElement('div')
                messageElement.classList.add('message-item')
                messageElement.textContent = `[${new Date(
                    message.timestamp,
                ).toLocaleTimeString()}] ID ${message.id}: ${message.text}`
                messagesDiv.prepend(messageElement) // Додаємо нові повідомлення нагору
            }

            // Функція, яка реалізує логіку Long-Polling на клієнті
            const subscribeForMessages = async () => {
                console.log('Клієнт: Відправляю запит на підписку...')
                try {
                    const response = await fetch(`${SERVER_URL}/subscribe`)

                    if (response.ok) {
                        const data = await response.json()
                        console.log('Клієнт: Отримано дані:', data)

                        // Якщо сервер відправив реальні дані
                        if (data.id) {
                            // Перевіряємо, чи це не повідомлення про таймаут
                            addMessageToDOM(data)
                        } else {
                            // Це може бути відповідь по таймауту або інше службове повідомлення
                            console.log('Клієнт: Сервер повідомив, що даних немає або таймаут.')
                        }
                        // Незалежно від того, чи були дані, відправляємо новий запит негайно
                        subscribeForMessages()
                    } else if (response.status === 502) {
                        // Статус 502 (Bad Gateway) може вказувати на таймаут проксі,
                        // або сервер перезавантажився, або інші мережеві проблеми.
                        // У цьому випадку просто повторюємо запит.
                        console.warn(
                            'Клієнт: Отримано 502 Bad Gateway (можливо, таймаут проксі). Повторний запит через 1 секунду...',
                        )
                        setTimeout(subscribeForMessages, 1000)
                    } else {
                        console.error('Клієнт: Помилка відповіді сервера:', response.status)
                        // У випадку помилки, спробувати повторити запит через деякий час
                        setTimeout(subscribeForMessages, 5000)
                    }
                } catch (error) {
                    console.error('Клієнт: Помилка запиту підписки:', error)
                    // У випадку мережевої помилки, спробувати повторити запит через деякий час
                    setTimeout(subscribeForMessages, 5000)
                }
            }

            // Запуск Long-Polling при завантаженні сторінки
            window.addEventListener('load', subscribeForMessages)

            // Функція для відправки повідомлень на сервер
            sendMessageBtn.addEventListener('click', async () => {
                const messageText = messageInput.value.trim()
                if (messageText) {
                    try {
                        const response = await fetch(`${SERVER_URL}/publish`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ message: messageText }),
                        })
                        if (response.ok) {
                            console.log('Клієнт: Повідомлення успішно відправлено.')
                            messageInput.value = '' // Очищаємо поле вводу
                        } else {
                            console.error(
                                'Клієнт: Помилка відправки повідомлення:',
                                response.status,
                            )
                        }
                    } catch (error) {
                        console.error('Клієнт: Мережева помилка при відправці повідомлення:', error)
                    }
                } else {
                    alert('Будь ласка, введіть повідомлення!')
                }
            })
        </script>
    </body>
</html>
```

# Server-Sent Events (SSE)

-   Server-Sent Events (SSE), або "Події, що надсилаються сервером", — це стандартна веб-технологія, яка дозволяє серверу надсилати (пушити) оновлення даних до клієнта (зазвичай веб-браузера) через одне постійне HTTP-з'єднання. Це форма "push"-зв'язку, де дані рухаються лише в одному напрямку: від сервера до клієнта.

## Як це працює:

1. Клієнт робить запит: Клієнт (веб-сторінка) створює об'єкт EventSource (вбудований JavaScript API) і вказує URL, до якого потрібно підключитися.

```js
const eventSource = new EventSource('http://localhost:3000/events')
```

2. Сервер встановлює постійне з'єднання: Сервер отримує цей HTTP GET-запит. Замість того, щоб закрити з'єднання після відправки однієї відповіді (як у звичайному HTTP-запиті) або тримати його невизначено довго, як у Long-Polling, сервер залишає його відкритим і встановлює заголовок Content-Type: text/event-stream. Це інформує браузер, що очікується потік подій.

3. Сервер надсилає події: Коли на сервері з'являються нові дані, він відправляє їх у потоці у спеціальному форматі. Кожна подія складається з одного або кількох полів, таких як data, event, id та retry, і завершується двома символами нового рядка (\n\n).

    Приклад формату події:

    ```
    event: message
    data: {"text": "Hello from server!"}
    id: 123

    event: update
    data: Some important update here.
    retry: 5000
    ```

4. Клієнт отримує та обробляє події: Об'єкт EventSource на клієнті слухає цей потік даних. Коли він отримує повну подію (тобто блок даних, що закінчується \n\n), він автоматично створює відповідну DOM-подію, яку можна обробити за допомогою JavaScript.
    - Якщо подія має поле event (наприклад, event: message), спрацьовує іменована подія (eventSource.addEventListener('message', handler)).
    - Якщо поле event відсутнє, спрацьовує загальна подія message (eventSource.onmessage = handler).
    - Поле data містить власне дані події.
    - Поле id дозволяє клієнту відновити зв'язок з останньою отриманою подією, якщо з'єднання перервалося (браузер автоматично відправляє заголовок Last-Event-ID при перепідключенні).
    - Поле retry дозволяє серверу вказати, через який інтервал (у мілісекундах) клієнт повинен спробувати перепідключитися, якщо з'єднання буде розірвано.

## Ключові особливості та переваги SSE:

-   Однонаправлена комунікація (сервер-клієнт): SSE ідеально підходить для сценаріїв, де клієнту потрібно лише отримувати оновлення від сервера, а не надсилати дані назад у постійному потоці. Приклади: стрічки новин, котирування акцій, результати спортивних матчів у реальному часі, сповіщення, оновлення дашбордів.
-   Простота: Реалізація SSE значно простіша, ніж WebSockets, як на стороні клієнта (вбудований EventSource API), так і на стороні сервера (просто надсилання тексту у певному форматі).
-   Використовує HTTP: SSE працює поверх стандартного HTTP-протоколу, що робить його дружнім до брандмауерів та проксі-серверів. Немає необхідності у спеціальних портах чи протоколах.
-   Вбудоване автоматичне перепідключення: EventSource API автоматично обробляє перепідключення, якщо з'єднання розривається. Він також може використовувати Last-Event-ID для відновлення потоку з останньої відомої події.
-   Ефективність: Хоча це і HTTP, постійне з'єднання та потокова передача даних роблять SSE більш ефективним, ніж багатократний Long-Polling, оскільки немає постійних накладних витрат на встановлення нових HTTP-з'єднань.

## Порівняння з іншими технологіями:

-   HTTP Long-Polling: SSE є вдосконаленням Long-Polling. Замість того, щоб клієнт постійно відправляв новий запит після отримання кожної відповіді (або таймауту), SSE підтримує одне постійне з'єднання, через яке сервер може надсилати багато подій. Це зменшує мережеві накладні витрати та спрощує логіку клієнта.

## Приклад реалізації Server-Sent Events (SSE)

```js
// server.js

import express from 'express'
import cors from 'cors' // Для дозволу запитів з інших доменів (якщо HTML файл відкривається локально)

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors()) // Дозволяємо CORS

// Зберігатимемо "лічильник" і надсилатимемо його як подію
let eventCounter = 0

// Масив для відстеження відкритих клієнтських з'єднань (response об'єктів)
const clients = []

// --- Ендпоінт для SSE-потоку ---
app.get('/events', (req, res) => {
    // Встановлюємо необхідні заголовки для SSE
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive') // Тримати з'єднання відкритим
    res.setHeader('X-Accel-Buffering', 'no') // Важливо для Nginx та деяких проксі-серверів

    // Надіслати початкове повідомлення (ID та "повтор")
    // Це потрібно для того, щоб клієнт міг використовувати Last-Event-ID
    // та знав, як часто перепідключатись у разі розриву з'єднання.
    res.write(`id: ${eventCounter}\n`)
    res.write(`retry: 5000\n\n`) // Клієнт спробує перепідключитися через 5 секунд

    // Додаємо поточний об'єкт відповіді до списку клієнтів
    clients.push(res)
    console.log(`[Сервер] Новий клієнт підключився. Всього клієнтів: ${clients.length}`)

    // Обробка відключення клієнта
    req.on('close', () => {
        const index = clients.indexOf(res)
        if (index !== -1) {
            clients.splice(index, 1) // Видаляємо клієнта зі списку
        }
        console.log(`[Сервер] Клієнт відключився. Залишилось клієнтів: ${clients.length}`)
    })
})

// Функція для надсилання подій всім підключеним клієнтам
const sendEventToClients = () => {
    eventCounter++
    const data = {
        message: `Це оновлення #${eventCounter} від сервера!`,
        timestamp: new Date().toLocaleTimeString(),
    }
    const eventId = eventCounter

    // Форматування події для SSE
    const sseMessage = `id: ${eventId}\ndata: ${JSON.stringify(data)}\n\n`

    // Надсилаємо подію кожному підключеному клієнту
    clients.forEach((res) => {
        try {
            res.write(sseMessage)
            console.log(`[Сервер] Надіслано подію ID ${eventId} клієнту.`)
        } catch (error) {
            // Може виникнути помилка, якщо клієнт вже відключився, але ще не був видалений
            console.error(`[Сервер] Помилка при відправці події клієнту: ${error.message}`)
        }
    })
}

// Імітація регулярних оновлень даних кожні 3 секунди
setInterval(sendEventToClients, 3000)

// Ендпоінт для кореневого URL, просто для інформації
app.get('/', (req, res) => {
    res.send('SSE Server is running. Open index.html in your browser.')
})

app.listen(PORT, () => {
    console.log(`SSE сервер слухає на http://localhost:${PORT}`)
    console.log('Відкрийте index.html у вашому браузері.')
})
```

```html
// index.html

<!DOCTYPE html>
<html lang="uk">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Server-Sent Events (SSE) Приклад</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                margin: 20px;
                background-color: #f4f4f4;
                color: #333;
            }
            h1 {
                color: #0056b3;
            }
            #status {
                font-weight: bold;
                margin-bottom: 15px;
                padding: 10px;
                border-radius: 5px;
            }
            .connected {
                background-color: #e6ffe6;
                color: #008000;
                border: 1px solid #008000;
            }
            .disconnected {
                background-color: #ffe6e6;
                color: #cc0000;
                border: 1px solid #cc0000;
            }
            #eventsLog {
                background-color: #fff;
                border: 1px solid #ddd;
                padding: 15px;
                min-height: 250px;
                max-height: 500px;
                overflow-y: auto;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            }
            .event-item {
                border-bottom: 1px dashed #eee;
                padding: 8px 0;
                font-size: 0.9em;
            }
            .event-item:last-child {
                border-bottom: none;
            }
            .event-timestamp {
                color: #777;
                font-size: 0.8em;
                margin-right: 5px;
            }
            .event-id {
                color: #555;
                font-weight: bold;
                margin-right: 5px;
            }
        </style>
    </head>
    <body>
        <h1>Server-Sent Events (SSE) Приклад</h1>

        <div id="status" class="disconnected">Статус: Відключено</div>

        <h2>Лог подій:</h2>
        <div id="eventsLog"></div>

        <script>
            const statusDiv = document.getElementById('status')
            const eventsLogDiv = document.getElementById('eventsLog')

            const SERVER_URL = 'http://localhost:3000/events' // URL вашого SSE-ендпоінту

            // Створення нового об'єкта EventSource
            // Цей об'єкт встановлює HTTP-з'єднання і починає слухати потік подій
            const eventSource = new EventSource(SERVER_URL)

            // --- Обробники подій EventSource ---

            // Обробник для загальної події 'message' (якщо сервер не вказує "event:")
            eventSource.onmessage = (event) => {
                // event.data містить дані, відправлені сервером
                // event.lastEventId містить останній ID, який сервер відправив
                console.log('Отримано загальне повідомлення:', event.data)
                try {
                    const data = JSON.parse(event.data) // Парсимо JSON-рядок у об'єкт
                    addEventToLog(
                        `ID: ${event.lastEventId}, Повідомлення: ${data.message} (${data.timestamp})`,
                    )
                } catch (e) {
                    addEventToLog(`ID: ${event.lastEventId}, Непарсинг дані: ${event.data}`)
                }
            }

            // Обробник, коли з'єднання з сервером встановлено
            eventSource.onopen = () => {
                console.log("З'єднання з SSE сервером встановлено.")
                statusDiv.textContent = 'Статус: Підключено'
                statusDiv.classList.remove('disconnected')
                statusDiv.classList.add('connected')
            }

            // Обробник помилок з'єднання
            eventSource.onerror = (error) => {
                console.error('Помилка EventSource:', error)
                statusDiv.textContent = 'Статус: Відключено (помилка)'
                statusDiv.classList.remove('connected')
                statusDiv.classList.add('disconnected')

                // EventSource автоматично спробує перепідключитися.
                // event.readyState показує стан з'єднання:
                // 0 (CONNECTING) - з'єднання ще не встановлено, або розірвано і відбувається спроба перепідключення
                // 1 (OPEN) - з'єднання відкрито і готове до обміну даними
                // 2 (CLOSED) - з'єднання було закрито
                if (eventSource.readyState === EventSource.CLOSED) {
                    console.log(
                        "З'єднання було закрито. EventSource спробує перепідключитися згідно retry.",
                    )
                }
            }

            // --- Допоміжна функція для відображення подій у лозі ---
            const addEventToLog = (message) => {
                const eventElement = document.createElement('div')
                eventElement.classList.add('event-item')
                eventElement.innerHTML = `
                <span class="event-timestamp">${new Date().toLocaleTimeString()}</span>
                ${message}
            `
                eventsLogDiv.prepend(eventElement) // Додаємо нові події нагору
                // Обмежуємо кількість елементів у лозі, щоб не перевантажувати DOM
                if (eventsLogDiv.children.length > 50) {
                    eventsLogDiv.removeChild(eventsLogDiv.lastChild)
                }
            }
        </script>
    </body>
</html>
```
