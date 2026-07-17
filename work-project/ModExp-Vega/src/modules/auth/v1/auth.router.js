import { Router } from 'express'

/**
 * @swagger
 * components:
 *   schemas:
 *     RegisterDto:
 *       type: object
 *       required:
 *         - login
 *         - email
 *         - password
 *         - firstName
 *         - lastName
 *       properties:
 *         login:
 *           type: string
 *           example: "ivan_petrov"
 *           minLength: 3
 *           description: "Унікальний текстовий логін користувача (мін. 3 символи)"
 *         email:
 *           type: string
 *           format: email
 *           example: "ivan@enterprise.com"
 *         password:
 *           type: string
 *           format: password
 *           example: "SecretPassword123"
 *           minLength: 6
 *         firstName:
 *           type: string
 *           example: "Іван"
 *         lastName:
 *           type: string
 *           example: "Петров"
 *         middleName:
 *           type: string
 *           example: "Миколайович"
 *           nullable: true
 *         autoLogin:
 *           type: boolean
 *           example: false
 *           description: "Якщо true, сервер одразу авторизує користувача та встановить сесію"
 *         rememberMe:
 *           type: boolean
 *           example: false
 *           description: "Використовується разом з autoLogin для тривалої сесії"
 *         authType:
 *           type: string
 *           enum: [DATABASE, APPLICATION]
 *           default: DATABASE
 *         deviceFingerprint:
 *           type: string
 *           example: null
 *           description: "SHA-256 хеш цифрового зліпка пристрою для захисту від перехоплення сесії - (8a4f9b2c3d1e6f7a)"
 *         appId:
 *           type: string
 *           example: ""
 *
 *     LoginDto:
 *       type: object
 *       required:
 *         - login
 *         - password
 *       properties:
 *         login:
 *           type: string
 *           example: "ivan_petrov"
 *         password:
 *           type: string
 *           format: password
 *           example: "SecretPassword123"
 *         rememberMe:
 *           type: boolean
 *           default: false
 *         authType:
 *           type: string
 *           enum: [DATABASE, APPLICATION]
 *           default: null
 *           description: "APPLICATION — перевірка по табл. USERS через bcrypt. DATABASE — перевірка через нативний пакет Oracle AUTH_PKG.VERIFY_DB_USER."
 *         deviceFingerprint:
 *           type: string
 *           example: null
 *           description: "SHA-256 хеш цифрового зліпка пристрою для захисту від перехоплення сесії - (8a4f9b2c3d1e6f7a)"
 *         appId:
 *           type: string
 *           example: ""
 *
 *     AuthResponse:
 *       type: object
 *       properties:
 *         accessToken:
 *           type: string
 *           description: "Short-lived JWT (Access Token). Також додатково дублюється в httpOnly Cookie"
 *           example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *         refreshToken:
 *           type: string
 *           description: "Long-lived JWT (Refresh Token). Також додатково дублюється в httpOnly Cookie"
 *           example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *         user:
 *           type: object
 *           properties:
 *             userId:
 *               type: integer
 *               example: 1024
 *             login:
 *               type: string
 *               example: "ivanov_dev"
 *             name:
 *               type: string
 *               example: "Іванов І.І."
 *             roles:
 *               type: array
 *               items:
 *                 type: string
 *               example: ["USER", "ADMIN"]
 *
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "Невірний логін або пароль"
 *         error:
 *           type: string
 *           example: "INVALID_CREDENTIALS"
 *           description: "Системний код помилки (напр. ACCOUNT_LOCKED, ACCOUNT_BANNED, ORACLE_DB_INVALID_CREDENTIALS)"
 */

export class AuthRouter {
    /**
     * @param {Object} authController - Контролер HTTP-шару (Інстанс нашого контролера)
     * @param {Object} authGuard - Екземпляр нашого класу AuthGuard
     */
    constructor(authController, authGuard) {
        this.router = Router()
        this.authController = authController
        this.guard = authGuard
        this.initRoutes()
    }

    /**
     * Ініціалізація та прив'язка HTTP-ендпоінтів до методів контролера
     */
    initRoutes() {
        // Обов'язково обгортаємо методи в анонімні функції (або використовуємо .bind),
        // щоб всередині контролера не губився контекст "this".

        // /**
        //  * @swagger
        //  * /api/v1/auth/register:
        //  *   post:
        //  *     summary: Реєстрація нового користувача в системі
        //  *     description: "Створює акаунт. Якщо передано `autoLogin: true`, паралельно виконує вхід (встановлює куки і повертає токени)."
        //  *     tags: [Auth]
        //  *     requestBody:
        //  *       required: true
        //  *       content:
        //  *         application/json:
        //  *           schema:
        //  *             $ref: '#/components/schemas/RegisterDto'
        //  *     responses:
        //  *       201:
        //  *         description: Користувача успішно створено
        //  *         content:
        //  *           application/json:
        //  *             schema:
        //  *               type: object
        //  *               properties:
        //  *                 id:
        //  *                   type: integer
        //  *                   example: 42
        //  *                 message:
        //  *                   type: string
        //  *                   example: "Користувача успішно створено"
        //  *                 accessToken:
        //  *                   type: string
        //  *                   example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
        //  *                 refreshToken:
        //  *                   type: string
        //  *                   example: "def502003a6b5c..."
        //  *                 user:
        //  *                   type: object
        //  *                   properties:
        //  *                     userId:
        //  *                       type: integer
        //  *                       example: 42
        //  *                     login:
        //  *                       type: string
        //  *                       example: "ivanov_dev"
        //  *                     name:
        //  *                       type: string
        //  *                       example: "Іванов І.І."
        //  *                     roles:
        //  *                       type: array
        //  *                       items:
        //  *                          type: string
        //  *                       example: ["USER", "ADMIN"]
        //  *       400:
        //  *         description: Помилка валідації або логін/email уже зайняті
        //  *         content:
        //  *           application/json:
        //  *             schema:
        //  *               $ref: '#/components/schemas/ErrorResponse'
        //  */
        // this.router.post('/register', (req, res, next) =>
        //     this.authController.register(req, res, next),
        // )

        /**
         * @swagger
         * /api/v1/auth/login:
         *   post:
         *     summary: Автентифікація користувача (Гібридний вхід)
         *     description: Повертає пару токенів у JSON, а також запіхає Refresh Token у захищені куки (httpOnly) для веб-клієнтів.
         *     tags: [Auth]
         *     requestBody:
         *       required: true
         *       content:
         *         application/json:
         *           schema:
         *             $ref: '#/components/schemas/LoginDto'
         *     responses:
         *       200:
         *         description: Успішний вхід
         *         headers:
         *           Set-Cookie:
         *             description: Кука `refreshToken` з параметрами httpOnly, secure, sameSite=strict
         *             schema:
         *               type: string
         *               example: "refreshToken=eyJhbG...; Path=/; HttpOnly; Secure; SameSite=Strict"
         *         content:
         *           application/json:
         *             schema:
         *               $ref: '#/components/schemas/AuthResponse'
         *       401:
         *         description: Невірний логін/пароль, акаунт заблоковано через брутфорс або бан адміна
         *         content:
         *           application/json:
         *             schema:
         *               $ref: '#/components/schemas/ErrorResponse'
         */
        this.router.post('/login', (req, res, next) => this.authController.login(req, res, next))

        /**
         * @swagger
         * /api/v1/auth/refresh:
         *   post:
         *     summary: Ротація сесії (Оновлення Access та Refresh токенів)
         *     description: Очікує Refresh JWT у cookies (Web), у тілі запиту (body), або в заголовку `x-refresh-token` (Mobile). Підтримує вікно благодаті (Grace Period 15 сек) для захисту від мережевих збоїв.
         *     tags: [Auth]
         *     parameters:
         *       - in: header
         *         name: x-refresh-token
         *         schema:
         *           type: string
         *         required: false
         *         description: Альтернативний спосіб передачі Refresh токена для мобільних додатків
         *     requestBody:
         *       required: false
         *       content:
         *         application/json:
         *           schema:
         *             type: object
         *             properties:
         *               refreshToken:
         *                 type: string
         *     responses:
         *       200:
         *         description: Токени успішно оновлено (відбулася ротація/відновлення сесії в Oracle DB)
         *         content:
         *           application/json:
         *             schema:
         *               $ref: '#/components/schemas/AuthResponse'
         *       401:
         *         description: Токен відсутній або повністю протермінований
         *       403:
         *         description: Виявлено компрометацію (атака повторного використання токена за межами Grace Period або не збігається Fingerprint пристрою)
         *         content:
         *           application/json:
         *             schema:
         *               $ref: '#/components/schemas/ErrorResponse'
         */
        this.router.post('/refresh', (req, res, next) =>
            this.authController.refresh(req, res, next),
        )

        /**
         * @swagger
         * /api/v1/auth/logout:
         *   post:
         *     summary: Закриття сесії користувача (Вихід із системи)
         *     description: >
         *       Анулює поточну сесію в Oracle DB (виставляє `REVOKED_AT = CURRENT_TIMESTAMP` з причиною 'logout').
         *       Працює в гібридному режимі: автоматично зчитує токен з Cookies (для Web),
         *       або очікує його в тілі запиту чи заголовках (для мобільних та десктопних додатків).
         *       У разі успіху для Web-клієнтів також надсилається заголовок видалення куки.
         *     tags: [Auth]
         *     parameters:
         *       - in: header
         *         name: x-refresh-token
         *         schema:
         *           type: string
         *         required: false
         *         description: Альтернативний спосіб передачі Refresh JWT у заголовках (для Mobile/Desktop клієнтів)
         *         example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
         *     requestBody:
         *       description: Тіло запиту для передачі Refresh токена, якщо запит робиться не з браузера.
         *       required: false
         *       content:
         *         application/json:
         *           schema:
         *             type: object
         *             properties:
         *               refreshToken:
         *                 type: string
         *                 description: "Повний рядок Refresh JWT, який потрібно анулювати"
         *                 example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
         *     responses:
         *       200:
         *         description: Сесію успішно закрито та видалено з активного реєстру Oracle DB.
         *         headers:
         *           Set-Cookie:
         *             description: Заголовок для примусового затирання куки `refreshToken` на стороні браузера (виставляє дату в минулому).
         *             schema:
         *               type: string
         *               example: "refreshToken=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly"
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 message:
         *                   type: string
         *                   example: "Сесію успішно закрито"
         *       400:
         *         description: Помилка валідації запиту (наприклад, невірний формат JSON).
         *         content:
         *           application/json:
         *             schema:
         *               $ref: '#/components/schemas/ErrorResponse'
         *       401:
         *         description: Токен відсутній. Жодне джерело (cookies, body, headers) не містило Refresh-токен для виконання виходу.
         *         content:
         *           application/json:
         *             schema:
         *               $ref: '#/components/schemas/ErrorResponse'
         *       500:
         *         description: Внутрішня помилка сервера (наприклад, збій зв'язку з базою даних Oracle під час оновлення статусу сесії).
         *         content:
         *           application/json:
         *             schema:
         *               $ref: '#/components/schemas/ErrorResponse'
         */
        this.router.post('/logout', (req, res, next) => this.authController.logout(req, res, next))

        /**
         * @swagger
         * /api/v1/auth/temporary-token:
         *   post:
         *     summary: Отримання універсального короткоживучого токена (Exchange Token)
         *     description: >
         *       Генерує одноразовий ультра-короткоживучий токен (від 30 секунд до 5 хвилин)
         *       для сценаріїв, де неможливо передати стандартні заголовки Authorization Bearer.
         *       Використовується для підключення до WebSockets, EventSource (SSE), прямих посилань на завантаження файлів або iframe.
         *       Вимагає наявності валідного головного Access Token у заголовках запиту.
         *     tags: [Auth]
         *     security:
         *       - bearerAuth: []
         *     requestBody:
         *       required: true
         *       content:
         *         application/json:
         *           schema:
         *             type: object
         *             required:
         *               - scope
         *             properties:
         *               scope:
         *                 type: string
         *                 enum: [WEBSOCKET, FILE_DOWNLOAD, SSE_STREAM, microservice_exchange]
         *                 description: Сфера (контекст) застосування тимчасового токена
         *                 example: "WEBSOCKET"
         *               expiresIn:
         *                 type: string
         *                 description: Тривалість дії токена. Регулярний вираз підтримує секунди (s) та хвилини (m) в межах безпечних лімітів.
         *                 default: "30s"
         *                 example: "45s"
         *     responses:
         *       200:
         *         description: Тимчасовий токен успішно згенеровано.
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 token:
         *                   type: string
         *                   description: Короткоживучий JWT, який містить скопійований payload користувача, а також параметри scope та tokenType
         *                 scope:
         *                   type: string
         *                   example: "WEBSOCKET"
         *                 expiresIn:
         *                   type: string
         *                   example: "30s"
         *       400:
         *         description: Помилка валідації вхідних параметрів або перевищено ліміт часу дії (макс. 5m).
         *       401:
         *         description: Головний Access Token відсутній, невалідний або прострочений.
         *       500:
         *         description: Внутрішня помилка сервера.
         */
        this.router.post('/temporary-token', this.guard.authenticateApi, (req, res, next) =>
            this.authController.getTemporaryToken(req, res, next),
        )

        /**
         * @swagger
         * /api/v1/auth/temporary-token/verify:
         *   post:
         *     summary: Внутрішня верифікація тимчасового токена (Для мікросервісів)
         *     description: >
         *       Використовується зовнішніми сервісами (наприклад, ізольованим WebSocket-сервером або API Gateway)
         *       для перевірки валідності тимчасового квитка та отримання профілю користувача.
         *     tags: [Auth]
         *     requestBody:
         *       required: true
         *       content:
         *         application/json:
         *           schema:
         *             type: object
         *             required:
         *               - token
         *               - scope
         *             properties:
         *               token:
         *                 type: string
         *                 description: Тимчасовий JWT токен (квиток)
         *                 example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
         *               scope:
         *                 type: string
         *                 enum: [WEBSOCKET, FILE_DOWNLOAD]
         *                 description: Область, для якої випускався токен
         *                 example: "WEBSOCKET"
         *     responses:
         *       200:
         *         description: Токен валідний. Повертається повний скопійований payload користувача.
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 valid:
         *                   type: boolean
         *                   example: true
         *                 user:
         *                   type: object
         *                   description: Автоматично скопійовані дані користувача з початкової сесії
         *       401:
         *         description: Токен невалідний, прострочений або головну сесію в Oracle DB було анульовано.
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 valid:
         *                   type: boolean
         *                   example: false
         *                 message:
         *                   type: string
         *                   example: "Тимчасовий токен недійсний або його термін дії закінчився"
         */
        this.router.post('/temporary-token/verify', (req, res, next) =>
            this.authController.verifyTemporaryToken(req, res, next),
        )

        /**
         * @swagger
         * api/v1/auth/introspect:
         *   post:
         *     summary: Перевірка access токена сторонніми сервісами (Token Introspection)
         *     description: Ендпоінт для мікросервісів та партнерів згідно з RFC 7662. Вимагає авторизації самого сервісу через заголовок API-ключа.
         *     tags: [Auth]
         *     security:
         *       - ServiceApiKeyAuth: []
         *     requestBody:
         *       required: false
         *       description: Токен можна передати в тілі запиту, якщо він не переданий у Header Authorization чи Cookie
         *       content:
         *         application/json:
         *           schema:
         *             type: object
         *             properties:
         *               token:
         *                 type: string
         *                 example: "eyJhbGciOiJIUzI1NiIsIn..."
         *     responses:
         *       200:
         *         description: Результат перевірки токена. Завжди повертає 200 OK, статус токена визначається прапорцем `active`.
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               required: [active]
         *               properties:
         *                 active:
         *                   type: boolean
         *                   description: Чи є токен валідним і активним на цей момент
         *                   example: true
         *                 sub:
         *                   type: integer
         *                   description: ID користувача (Subject)
         *                   example: 42
         *                 exp:
         *                   type: integer
         *                   description: Unix-timestamp завершення дії токена
         *                   example: 1716654000
         *                 user:
         *                   type: object
         *                   properties:
         *                     id:
         *                       type: integer
         *                       example: 42
         *                     login:
         *                       type: string
         *                       example: "user123"
         *                     email:
         *                       type: string
         *                       example: "user@example.com"
         *                     roles:
         *                       type: array
         *                       items:
         *                         type: string
         *                       example: ["USER", "MANAGER"]
         *       400:
         *         description: TOKEN_MISSING (не передано жодним із шляхів)
         *       401:
         *         description: Помилка авторизації самого стороннього сервісу (невірний API-Key)
         */
        this.router.post(
            '/introspect',
            // this.apiKeyMiddleware, // Middleware для захисту інтроспекції сторонніх сервісів
            (req, res, next) => this.authController.introspect(req, res, next),
        )
    }

    /**
     * Повертає сконфігурований Express роутер назовні
     */
    getRouter() {
        return this.router
    }
}
