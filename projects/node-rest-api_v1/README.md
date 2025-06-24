# Структура проекту: REST API

<!-- GET INFO FOR UPDATES MODULES -->
npm outdated    --  Перевірити доступні оновлення
npm update      --  Оновити всі залежності до останніх версій

```plaintext
rest-api/
├── src/
│   ├── config/
│   │   ├── Database.js             # Pool підключення до Oracle DB
│   │   ├── ServerConfig.js         # Конфігурація сервера HTTP/HTTPS
│   │   └── AppConfig.js            # Загальні конфігурації
│   ├── controllers/                # Контролери
│   ├── middlewares/                # Middleware
│   ├── models/                     # Моделі
│   ├── routes/                     # Маршрути
│   ├── services/                   # Логіка сервісів
│   ├── utils/                      # Утиліти (наприклад, стандартні відповіді)
│   └── App.js                      # Головний клас застосунку
├── certs/                          # Сертифікати для HTTPS
│   ├── server.key                  # Приватний ключ
│   └── server.cert                 # Сертифікат
├── .env                            # Налаштування середовища
├── .gitignore                      # Ігноровані файли
├── package.json                    # Залежності та скрипти


```

# Basic API

This is a boilerplate for an Express based API written in Typescript. Simply clone this repository and run.

```bash
npm install
```

You can use nodemon or ts-node to run a development server. Install them globally first:

```bash
npm install -g nodemon ts-node typescript
```

Then, run:

```bash
nodemon
```

<!--  -->
<!-- node --watch -->

```js
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
```

```js
// Додаємо міддлвар для логування запитів через morgan з використанням winston
app.use(
  morgan(":method :url :status :res[content-length] - :response-time ms", {
    stream: {
      // Configure Morgan to use our custom logger with the http severity
      write: (message) => config.logger.http(message.trim()),
    },
  })
);
```

```plaintext
1. Route (Маршрут):
Відповідає за визначення URL-шляху і з'єднання з відповідними контролерами. Тут ми визначаємо HTTP методи (GET, POST, PUT, DELETE тощо) і визначаємо, який контролер викликати для обробки запиту.

2. Controller (Контролер):
Контролер — це точка входу для обробки HTTP запитів, він отримує дані з запиту (параметри, тіло запиту тощо) і передає їх до відповідних сервісів для подальшої обробки.

3. Service (Сервіс):
Сервіси займаються основною бізнес-логікою. Вони обробляють дані (наприклад, взаємодія з базою даних, хешування паролів, перевірка умов) і повертають результат. Контролер не має виконувати складні операції, це завдання сервісу.
```
