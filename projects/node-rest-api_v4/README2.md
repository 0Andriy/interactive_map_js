# Структура проекту: REST API

```plaintext
your-project/
├── src/
│   ├── config/
│   │   ├── index.js          # Загальні налаштування додатка
│   │   └── database.js       # Налаштування підключення до OracleDB
│   ├── middleware/
│   │   ├── authMiddleware.js   # Перевірка JWT-токенів для захисту маршрутів
│   │   ├── authorizeRoles.js   # Перевірка ролей користувача
│   │   ├── errorHandler.js     # Централізований обробник помилок
│   │   ├── loggingUserResolver.js # Вилучення даних користувача для логування
│   │   └── validateSchema.js   # Універсальний middleware для Zod валідації
│   ├── models/
│   │   ├── User.js             # Модель користувача для OracleDB
│   │   └── RefreshToken.js     # Модель для зберігання Refresh токенів у БД
│   ├── routes/
│   │   └── v1/
│   │       ├── index.js        # Агрегуючий файл для маршрутів v1
│   │       └── auth/
│   │           ├── auth.controller.js # Обробники логіки аутентифікації
│   │           ├── auth.route.js    # Маршрути для аутентифікації
│   │           └── auth.service.js  # Бізнес-логіка аутентифікації
│   │       └── user/
│   │           ├── user.controller.js # Контролер для прикладу захищеного маршруту
│   │           └── user.route.js    # Маршрути для користувачів
│   ├── schemas/
│   │   └── authSchemas.js      # Zod схеми для реєстрації, логіну, оновлення токена
│   ├── utils/
│   │   ├── bcrypt.js           # Хешування та порівняння паролів
│   │   ├── jwt.js              # Генерація та верифікація JWT
│   │   └── logger.js           # Налаштування логування
│   └── app.js                  # Основний файл Express.js додатка
├── .env                        # Змінні середовища
├── package.json                # Залежності проєкту
```

```plaintext
your-project/
├── src/
│   ├── config/
│   │   ├── index.js          # Загальні налаштування додатка
│   │   └── database.js       # Налаштування підключення до OracleDB
│   ├── middleware/
│   │   ├── authMiddleware.js   # Перевірка JWT-токенів для захисту маршрутів
│   │   ├── authorizeRoles.js   # Перевірка ролей користувача
│   │   ├── errorHandler.js     # Централізований обробник помилок
│   │   ├── loggingUserResolver.js # Вилучення даних користувача для логування
│   │   └── validateSchema.js   # Універсальний middleware для Zod валідації
│   ├── models/               # Моделі залишаються глобальними
│   │   ├── User.js             # Модель користувача для OracleDB
│   │   └── RefreshToken.js     # Модель для зберігання Refresh токенів у БД
│   ├── routes/
│   │   └── v1/
│   │       ├── index.js        # Агрегуючий файл для маршрутів v1
│   │       └── auth/
│   │           ├── auth.controller.js # Обробники логіки аутентифікації
│   │           ├── auth.route.js    # Маршрути для аутентифікації
│   │           ├── auth.service.js  # Бізнес-логіка аутентифікації
│   │           └── schemas/         # <-- Схеми тепер тут
│   │               └── authSchemas.js
│   │       └── user/
│   │           ├── user.controller.js # Контролер для прикладу захищеного маршруту
│   │           ├── user.route.js    # Маршрути для користувачів
│   │           └── schemas/         # <-- Схеми для користувача (якщо будуть)
│   │               └── userSchemas.js # (Додамо для прикладу)
│   ├── utils/
│   │   ├── bcrypt.js           # Хешування та порівняння паролів
│   │   ├── jwt.js              # Генерація та верифікація JWT
│   │   └── logger.js           # Налаштування логування
│   └── app.js                  # Основний файл Express.js додатка
├── .env                        # Змінні середовища
├── package.json                # Залежності проєкту
```
