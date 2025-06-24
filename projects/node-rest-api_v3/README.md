# Структура проекту: REST API

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

GET INFO FOR UPDATES MODULES

```bash
npm outdated    --  Перевірити доступні оновлення
npm update      --  Оновити всі залежності до останніх версій
```

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
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
```

```js
// Додаємо міддлвар для логування запитів через morgan з використанням winston
app.use(
    morgan(':method :url :status :res[content-length] - :response-time ms', {
        stream: {
            // Configure Morgan to use our custom logger with the http severity
            write: (message) => config.logger.http(message.trim()),
        },
    }),
)
```

```plaintext
1. Route (Маршрут):
Відповідає за визначення URL-шляху і з'єднання з відповідними контролерами. Тут ми визначаємо HTTP методи (GET, POST, PUT, DELETE тощо) і визначаємо, який контролер викликати для обробки запиту.

2. Controller (Контролер):
Контролер — це точка входу для обробки HTTP запитів, він отримує дані з запиту (параметри, тіло запиту тощо) і передає їх до відповідних сервісів для подальшої обробки.

3. Service (Сервіс):
Сервіси займаються основною бізнес-логікою. Вони обробляють дані (наприклад, взаємодія з базою даних, хешування паролів, перевірка умов) і повертають результат. Контролер не має виконувати складні операції, це завдання сервісу.
```


# Звернути увагу (для покращення розробки)

Dependency Injection (DI)  - Впровадження залежностей
Inversion of Control (IoC) - Інверсія управління


1. Фундаментальні Концепції ООП
Принципи SOLID: Особливо Dependency Inversion Principle (DIP), Single Responsibility Principle (SRP), Open/Closed Principle (OCP).
Абстракції та Інтерфейси: Як створювати ефективні контракти для залежностей.
Слабка зв'язаність (Loose Coupling) vs. Тісна зв'язаність (Tight Coupling): Розуміння, чому слабка зв'язаність є бажаною та як DI її досягає.
2. Патерни Проектування, Пов'язані з IoC/DI
Strategy (Стратегія): Для впровадження різних алгоритмів.
Factory Method (Фабричний Метод) та Abstract Factory (Абстрактна Фабрика): Для розуміння процесів створення об'єктів.
Decorator (Декоратор): Для додавання поведінки до об'єктів під час виконання.
3. Методи Впровадження Залежностей
Впровадження через конструктор (Constructor Injection): Найкращий підхід для обов'язкових залежностей.
Впровадження через властивість/сеттер (Property/Setter Injection): Для необов'язкових залежностей.
4. Використання DI-контейнерів (IoC-контейнерів)
Призначення та Переваги: Як вони автоматизують управління залежностями.
Реєстрація та Розпізнавання (Resolution): Процес конфігурації та отримання об'єктів з контейнера.
Життєвий цикл об'єктів (Lifetimes/Scopes): Різні режими створення екземплярів (Singleton, Transient, Scoped).
Впровадження залежностей у фреймворках: Як DI інтегровано в популярні фреймворки (наприклад, Angular, Spring, ASP.NET Core).
5. Тестування з DI
Мокування (Mocking) та Стаби (Stubbing): Як DI спрощує юніт-тестування, дозволяючи замінювати реальні залежності на тестові "заглушки".
Фреймворки для мокування: Ознайомлення з бібліотеками для мокування (наприклад, Jest у JS, Moq у C#, Mockito у Java).
6. Практика та Рефакторинг
Перетворення "старого" коду: Рефакторинг існуючого коду для застосування принципів DI.
Написання нового коду з DI: Свідоме використання DI при розробці нових компонентів.
