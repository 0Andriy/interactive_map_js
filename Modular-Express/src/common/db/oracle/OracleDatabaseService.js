import oracledb from 'oracledb'
import { Readable, Transform, Writable, pipeline } from 'node:stream'

/**
 * @typedef {Object} InternalContext
 * @property {import('oracledb').Connection} [connection] - Активна сесія для транзакцій.
 * @property {string} [traceId] - Унікальний ідентифікатор для сквозного логування.
 * @property {number} [startTime] - Мітка часу початку операції для вимірювання тривалості.
 */

/**
 * @typedef {Object} ConnectionResult
 * @property {Object} connection - Об'єкт з'єднання Oracle.
 * @property {boolean} isLocal - Прапорець, що вказує, чи було з'єднання створене локально в межах поточного виклику (true), чи взяте з існуючого контексту (false).
 */

/**
 * @typedef {Object} TransactionContext
 * @property {Object} connection - Прямий доступ до об'єкта з'єднання oracledb.
 * @property {Function} execute - Виконання SQL запиту в межах транзакції.
 * @property {Function} executeMany - Масове виконання запитів у межах транзакції.
 * @property {Function} select - Отримання масиву об'єктів у межах транзакції.
 * @property {Function} findOne - Отримання одного запису в межах транзакції.
 * @property {Function} queryStream - Створення потоку результатів у межах транзакції.
 */

/**
 * @typedef {Object} AuthResult
 * @property {boolean} success - Чи успішна автентифікація.
 * @property {string|null} errorCode - Код помилки Oracle (наприклад, 'ORA-01017'), якщо success: false.
 * @property {string|null} message - Текстове повідомлення про помилку.
 */

/**
 * Senior-level обгортка над Oracle Database для Node.js (ES6).
 * Реалізує DI, DRY, паттерн контексту та безпечну роботу з сесіями.
 */
export class OracleDatabaseService {
    /**
     * @param {Object} opts - Налаштування сервісу.
     * @param {Object} opts.logger - Екземпляр логера з підтримкою .child() та опціональних викликів.
     * @param {import('oracledb').PoolAttributes} opts.config - Конфігурація підключення.
     * @param {boolean} [opts.isStandalone=false] - Режим роботи без пулу (прямі підключення).
     * @param {import('oracledb').InitOptions} [opts.thickModeOptions] - Опції для Thick режиму (якщо вказано, активує Thick).
     */
    constructor(opts = {}) {
        this.oracledb = oracledb
        this.isStandalone = opts.isStandalone || false

        // Режим Thick активується, якщо передано об'єкт опцій (навіть порожній)
        // libDir: шлях до Oracle Instant Client (обов'язково для Linux/macOS Thick)
        this.thickModeOptions = opts.thickModeOptions || null
        this.useThickMode = !!opts.thickModeOptions

        /**
         * Ініціалізація логера через DI з контекстом компонента
         */
        this.logger = opts.logger?.child?.({ component: 'OracleDatabaseService' }) ?? opts.logger

        /**
         * Дефолтні налаштування пулу
         */
        this.defaultConfig = {
            // user: 'admin', // Consider removing defaults for sensitive info
            // password: 'admin', // Consider removing defaults for sensitive info
            // connectString: `(DESCRIPTION=(ADDRESS_LIST=(ADDRESS=(PROTOCOL=TCP)(HOST=ip)(PORT=port)))(CONNECT_DATA=(SID=sid)))`, // Consider removing defaults for sensitive info
            // edition: 'ORA$BASE', // used for Edition Based Redefintion
            // events: false, // whether to handle Oracle Database FAN and RLB events or support CQN
            // externalAuth: false, // whether connections should be established using External Authentication
            // homogeneous: true, // all connections in the pool have the same credentials
            // poolAlias: 'default', // set an alias to allow access to the pool via a name.
            // poolIncrement: 1, // only grow the pool by one connection at a time
            // poolMax: 4, // maximum size of the pool. (Note: Increase UV_THREADPOOL_SIZE if you increase poolMax in Thick mode)
            // poolMin: 0, // start with no connections; let the pool shrink completely
            // poolPingInterval: 60, // check aliveness of connection if idle in the pool for 60 seconds
            // poolTimeout: 60, // terminate connections that are idle in the pool for 60 seconds
            // queueMax: 500, // don't allow more than 500 unsatisfied getConnection() calls in the pool queue
            // queueTimeout: 60000, // terminate getConnection() calls queued for longer than 60000 milliseconds
            sessionCallback: this.initSession.bind(this), // Binds 'this' to OracleDbManager instance
            // sodaMetaDataCache: false, // Set true to improve SODA collection access performance
            // stmtCacheSize: 30, // number of statements that are cached in the statement cache of each connection
            // enableStatistics: false, // record pool usage for oracledb.getPool().getStatistics() and logStatistics()
        }
        this.config = { ...this.defaultConfig, ...opts.config }

        /**
         * Дефолтні опції виконання запитів
         */
        this.defaultOptions = {
            autoCommit: true,
            outFormat: oracledb.OUT_FORMAT_OBJECT,
            fetchTypeHandler: (metaData) => {
                if (metaData.dbType === oracledb.DB_TYPE_BLOB) {
                    return { type: oracledb.BUFFER }
                }

                if (metaData.dbType === oracledb.DB_TYPE_CLOB) {
                    return { type: oracledb.STRING }
                }

                return undefined
            },
        }

        this.pool = null
    }

    /**
     * Ініціалізує нову сесію бази даних для вказаного тегу.
     * Встановлює рівень ізоляції транзакцій (READ COMMITTED) та виконує зворотний виклик.
     *
     * @async
     * @param {Object} connection - Об'єкт підключення до бази даних (наприклад, Oracle або PostgreSQL).
     * @param {Function} connection.execute - Метод для виконання SQL-запитів.
     * @param {string} requestedTag - Ідентифікатор або тег сесії для логування та відстеження.
     * @param {function(Error|null): void} callbackFn - Функція зворотного виклику, що викликається після завершення.
     * Приймає об'єкт помилки `error` як перший аргумент, якщо операція завершилась невдало.
     *
     * @returns {Promise<void>}
     *
     * @example
     * const connection = { execute: async (sql) => console.log(`Executing: ${sql}`) };
     * const tag = 'user-session-123';
     *
     * await service.initSession(connection, tag, (err) => {
     *     if (err) {
     *         console.error('Failed to init:', err);
     *         return;
     *     }
     *     console.log('Session is ready to use');
     * });
     */
    async initSession(connection, requestedTag, callbackFn) {
        this.logger?.debug?.(`Initializing new session settings for tag: ${requestedTag}`)
        try {
            await connection.execute(`ALTER SESSION SET ISOLATION_LEVEL = READ COMMITTED`)
            this.logger?.info?.(`Session for tag ${requestedTag} initialized successfully.`)
            callbackFn()
        } catch (error) {
            this.logger?.error?.(`Error initializing session for tag ${requestedTag}:`, error)
            callbackFn(error)
        }
    }

    /**
     * Ініціалізує драйвер Oracle та створює пул з'єднань.
     *
     * Метод виконує дві основні дії:
     * 1. Якщо активовано `useThickMode`, переводить драйвер у "Thick" режим (потрібен для розширених функцій).
     * 2. Створює пул з'єднань на основі наданої конфігурації (якщо додаток не в режимі `isStandalone`).
     *
     * @async
     * @throws {Error} Викидає помилку, якщо не вдалося ініціалізувати Oracle Client або створити пул.
     * @returns {Promise<void>}
     *
     * @example
     * try {
     *   await dbService.initialize();
     *   console.log('Database system is ready');
     * } catch (err) {
     *   console.error('Initialization failed:', err);
     * }
     *
     * @description
     * Більше про режими драйвера можна дізнатися у [Node-oracledb Documentation](https://node-oracledb.readthedocs.io).
     */
    async initialize() {
        // Ініціалізація Thick режиму, якщо вказано в опціях (тільки якщо драйвер ще в Thin режимі)
        if (this.useThickMode && this.oracledb.thin) {
            try {
                // Якщо thickModeOptions порожній об'єкт {}, драйвер шукатиме клієнта в системних шляхах
                this.oracledb.initOracleClient(this.thickModeOptions)
                this.logger?.info?.('Oracle Thick mode initialized')
            } catch (err) {
                this.logger?.error?.('Failed to initialize Oracle Thick mode', {
                    error: err.message,
                })
                throw err
            }
        }

        if (this.isStandalone) return
        if (this.pool) return

        try {
            this.pool = await this.oracledb.createPool(this.config)
            this.logger?.info?.('Oracle Pool initialized', {
                poolAlias: this.config.poolAlias || 'default',
                poolMax: this.config.poolMax,
            })
        } catch (error) {
            this.logger?.error?.('Failed to initialize Oracle pool', { error: error.message })
            throw error
        }
    }

    // --- Приватні допоміжні методи (Core) ---

    /**
     * Отримує з'єднання з базою даних залежно від контексту та режиму роботи (Pool або Standalone).
     *
     * Логіка роботи:
     * 1. Якщо в контексті вже є з'єднання, повертає його.
     * 2. Якщо ні — ініціалізує сервіс (якщо треба) та створює нове з'єднання.
     *
     * @private
     * @async
     * @param {Object} internalCtx - Внутрішній об'єкт контексту операції.
     * @param {Object} [internalCtx.connection] - Вже існуюче з'єднання (якщо є).
     *
     * @returns {Promise<ConnectionResult>} Об'єкт, що містить з'єднання та маркер локальності.
     *
     * @throws {Error} Якщо не вдалося підключитися до бази даних або ініціалізувати пул через [oracledb.getConnection](https://node-oracledb.readthedocs.io).
     *
     * @example
     * // Використання всередині класу
     * const { connection, isLocal } = await this._acquireConnection(internalCtx);
     * try {
     *     // виконання запиту...
     * } finally {
     *     if (isLocal) await connection.close(); // Закриваємо лише якщо ми його створили
     * }
     */
    async _acquireConnection(internalCtx) {
        if (internalCtx.connection) {
            return { connection: internalCtx.connection, isLocal: false }
        }

        // Переконуємось, що драйвер/пул ініціалізовані
        await this.initialize()

        if (this.isStandalone) {
            const connection = await this.oracledb.getConnection(this.config)
            return { connection, isLocal: true }
        }

        const connection = await this.pool.getConnection()
        return { connection, isLocal: true }
    }

    /**
     * Безпечно повертає з'єднання в пул або повністю закриває його (для Standalone режиму).
     *
     * Метод закриває з'єднання лише в тому випадку, якщо воно було позначене як локальне (`isLocal: true`).
     * Це запобігає закриттю з'єднань, які були передані ззовні (наприклад, у межах транзакції).
     *
     * @private
     * @async
     * @param {Object} conn - Об'єкт з'єднання Oracle, який потрібно вивільнити.
     * @param {boolean} isLocal - Прапорець локальності:
     * `true` — з'єднання створене всередині поточного виклику і має бути закрите;
     * `false` — з'єднання використовується в ширшому контексті, його не можна закривати тут.
     * @param {string} [reason='operation finished'] - Причина вивільнення для логування (допомагає при налагодженні).
     *
     * @returns {Promise<void>}
     *
     * @example
     * // Типовий сценарій використання в блоці finally
     * let connObj;
     * try {
     *     connObj = await this._acquireConnection(ctx);
     *     // ... робота з БД ...
     * } finally {
     *     if (connObj) {
     *         await this._releaseConnection(connObj.conn, connObj.isLocal, 'end of execute');
     *     }
     * }
     *
     * @description
     * Докладніше про керування з'єднаннями читайте у розділі [Closing Connections](https://node-oracledb.readthedocs.io) офіційної документації.
     */
    async _releaseConnection(conn, isLocal, reason = 'operation finished') {
        if (isLocal && conn) {
            try {
                await conn.close()
                this.logger?.debug?.(`Connection released: ${reason}`)
            } catch (err) {
                this.logger?.error?.('Error closing Oracle connection', { error: err.message })
            }
        }
    }

    /**
     * Зливає базові опції драйвера з користувацькими та налаштовує логіку обробки типів даних.
     *
     * Логіка пріоритетів `fetchTypeHandler`:
     * 1. Якщо колонка вказана в `fetchInfo`, повертається `undefined` (використовується поведінка за замовчуванням/стріми).
     * 2. Якщо задано `userHandler`, використовується його результат.
     * 3. Якщо попередні кроки не дали результату, використовується глобальний `defaultHandler`.
     *
     * @private
     * @async
     * @param {Object} [userOptions={}] - Специфічні опції для поточного запиту.
     * @param {boolean} [inTransaction=false] - Чи виконується запит у межах транзакції.
     * Якщо `true`, параметр `autoCommit` примусово встановлюється в `false`.
     *
     * @returns {Promise<Object>} Об'єкт з фінальними опціями для методу `execute()`.
     *
     * @example
     * const options = await this._mergeOptions({
     *   autoCommit: true,
     *   fetchInfo: { "MY_CLOB": { type: oracledb.STRING } }
     * }, true);
     * // options.autoCommit буде false, оскільки inTransaction = true
     *
     * @see {@link https://node-oracledb.readthedocs.io Execution Options}
     */
    async _mergeOptions(userOptions = {}, inTransaction = false) {
        // 1. Копіюємо базові опції та опції користувача
        const options = { ...this.defaultOptions, ...userOptions }

        // 2. Транзакційна логіка. В транзакції autoCommit має бути завжди false
        if (inTransaction) {
            options.autoCommit = false
        }

        // 3. Створюємо "розумний" handler
        const defaultHandler = this.defaultOptions.fetchTypeHandler
        const userHandler = userOptions.fetchTypeHandler

        // Створюємо Map для швидкого доступу та збереження значень типів
        // Перетворюємо ключі fetchInfo у верхній регістр для незалежності від регістру
        const manualFetchMap = new Map(
            userOptions.fetchInfo
                ? Object.entries(userOptions.fetchInfo).map(([k, v]) => [k.toUpperCase(), v])
                : [],
        )

        // Combined fetchTypeHandler logic: user's handler takes precedence
        options.fetchTypeHandler = (metaData) => {
            const colName = metaData.name.toUpperCase()

            // ПРІОРІТЕТ 1: Пряме вказання типу у fetchInfo
            // Якщо користувач вказав { MY_COL: oracledb.STRING }, ми повернемо цей тип
            if (manualFetchMap.has(colName)) {
                const specificType = manualFetchMap.get(colName)

                // Якщо значення в fetchInfo — об'єкт (наприклад, {type: ...}),
                // повертаємо тільки поле type, інакше повертаємо саме значення.
                return specificType && typeof specificType === 'object'
                    ? specificType.type
                    : specificType
            }

            // ПРІОРІТЕТ 2: Якщо користувач передав свій специфічний handler для цього запиту
            if (typeof userHandler === 'function') {
                const result = userHandler(metaData)
                if (result) return result
            }

            // ПРІОРІТЕТ 3: Глобальний обробник за замовчуванням
            if (typeof defaultHandler === 'function') {
                const result = defaultHandler(metaData)
                if (result) return result
            }

            return undefined
        }

        return options
    }

    /**
     * Внутрішній метод для виконання SQL-запитів без автоматичного закриття з'єднання.
     *
     * @description
     * Цей метод є ядром класу. Він автоматично вирішує, чи використовувати існуюче з'єднання
     * з `internalCtx`, чи відкрити нове. На відміну від публічного `execute()`, цей метод
     * НЕ звільняє з'єднання у блоці `finally`, покладаючи цю відповідальність на викликаючий метод.
     * Це необхідно для операцій, де з'єднання має бути активним після завершення SQL (наприклад, для LOB-стрімів).
     *
     * @param {string} sql - SQL запит (INSERT, UPDATE, SELECT тощо).
     * @param {Object} [params={}] - Об'єкт параметрів прив'язки.
     * @param {Object} [options={}] - Опції Oracle (outFormat, fetchInfo тощо).
     * @param {Object} [internalCtx={}] - Контекст виконання.
     * @param {Object} [internalCtx.connection] - Вже відкрите з'єднання (якщо передано, буде використано воно).
     * @param {string} [internalCtx.traceId] - Ідентифікатор для логування.
     *
     * @returns {Promise<{result: Object, conn: Object, isLocal: boolean}>}
     * Об'єкт, що містить:
     * - `result`: результат виконання `connection.execute`.
     * - `connection`: об'єкт з'єднання Oracle.
     * - `isLocal`: boolean, чи було з'єднання створено всередині цього виклику (true), чи взято з контексту (false).
     *
     * @example
     * // 1. Використання для кастомної транзакції:
     * const { result, connection, isLocal } = await this._internalExecute(sql, params, {}, ctx);
     * try {
     *     // робимо щось ще з connection...
     *     if (isLocal) await connection.commit();
     * } catch (e) {
     *     if (isLocal) await connection.rollback();
     *     throw e;
     * } finally {
     *     await this._releaseConnection(connection, isLocal);
     * }
     *
     * @example
     * // 2. Використання в uploadBlob (збереження дескриптора):
     * const { result, connection, isLocal } = await this._internalExecute(sql, params, options, ctx);
     * const lob = result.outBinds.lobbv;
     * await sourceStream.pipe(lob); // З'єднання все ще відкрите!
     *
     * @protected
     */
    async _internalExecute(sql, params = {}, options = {}, internalCtx = {}) {
        // Визначаємо з'єднання через допоміжний метод (враховує контекст)
        const { connection, isLocal } = await this._acquireConnection(internalCtx)

        // В транзакціях (isLocal=false) вимикаємо autoCommit через _mergeOptions
        const combinedOptions = await this._mergeOptions(options, !isLocal)
        const start = internalCtx.startTime || Date.now()

        try {
            const result = await connection.execute(sql, params, combinedOptions)

            this.logger?.debug?.('SQL Executed (Internal)', {
                sql: sql.trim().substring(0, 100), // логуємо лише початок для чистоти
                duration: `${Date.now() - start}ms`,
                traceId: internalCtx.traceId,
            })

            return { result, connection, isLocal }
        } catch (error) {
            this.logger?.error?.('Internal Execution error', {
                sql: sql.trim(),
                message: error.message,
                traceId: internalCtx.traceId,
            })

            // Якщо помилка сталася до того, як ми передали conn далі — звільняємо його
            await this._releaseConnection(connection, isLocal)
            throw error
        }
    }

    // --- Публічні методи виконання запитів ---

    /**
     * Основний метод для виконання SQL-запитів до бази даних Oracle.
     *
     * Метод автоматично керує життєвим циклом з'єднання:
     * 1. Отримує з'єднання (з пулу або контексту).
     * 2. Готує опції (враховуючи транзакційний режим).
     * 3. Виконує запит та логує результат/помилки.
     * 4. Гарантовано звільняє з'єднання у блоці `finally`.
     *
     * @async
     * @param {string} sql - Текст SQL-запиту (SELECT, INSERT, UPDATE тощо).
     * @param {Object|Array} [params={}] - Bind-параметри для запиту (іменовані або позиційні).
     * @param {import('oracledb').ExecuteOptions} [options={}] - Додаткові опції виконання (наприклад, `fetchInfo`, `autoCommit`).
     * @param {InternalContext} [internalCtx={}] - Контекст внутрішнього виклику для трасування та керування транзакціями.
     *
     * @returns {Promise<import('oracledb').Result<Object>>} Об'єкт результату виконання запиту.
     *
     * @throws {Error} Викидає помилку Oracle (наприклад, ORA-XXXXX), якщо запит не вдався.
     *
     * @example
     * // 1. Простий SELECT з параметрами
     * const result = await db.execute(
     *   "SELECT * FROM users WHERE id = :id",
     *   { id: 101 }
     * );
     *
     * @example
     * // 2. Використання fetchInfo для отримання CLOB як тексту
     * const result = await db.execute(
     *   "SELECT large_text FROM documents",
     *   {},
     *   { fetchInfo: { "LARGE_TEXT": { type: oracledb.STRING } } }
     * );
     *
     * @description
     * Докладніше про виконання запитів дивіться у [Oracle Database Node.js Driver API](https://node-oracledb.readthedocs.io).
     */
    async execute(sql, params = {}, options = {}, internalCtx = {}) {
        const { connection, isLocal } = await this._acquireConnection(internalCtx)
        const combinedOptions = await this._mergeOptions(options, !isLocal)
        const start = internalCtx.startTime || Date.now()

        try {
            const result = await connection.execute(sql, params, combinedOptions)

            this.logger?.debug?.('SQL Executed', {
                sql: sql.trim(),
                duration: `${Date.now() - start}ms`,
                traceId: internalCtx.traceId,
            })

            return result
        } catch (error) {
            this.logger?.error?.('Execution error', {
                sql: sql.trim(),
                message: error.message,
                offset: error.offset,
                traceId: internalCtx.traceId,
            })
            throw error
        } finally {
            await this._releaseConnection(connection, isLocal)
        }
    }

    /**
     * Виконує масові SQL-операції (Bulk Insert/Update/Delete).
     *
     * Оптимізований метод для вставки або оновлення великої кількості рядків за один виклик.
     * Використовує механізм пакетної обробки Oracle для підвищення продуктивності.
     *
     * @async
     * @param {string} sql - SQL текст (наприклад, INSERT INTO table (id) VALUES (:1)).
     * @param {Array<Object>|Array<Array>} [bindsArray=[]] - Масив даних для прив'язки (binds).
     * @param {import('oracledb').ExecuteManyOptions} [options={}] - Опції масового виконання.
     * @param {InternalContext} [internalCtx={}] - Внутрішній контекст для трасування та керування з'єднанням.
     *
     * @returns {Promise<import('oracledb').BatchResult>} Об'єкт результату виконання, що містить кількість зачеплених рядків (rowsAffected).
     *
     * @throws {Error} Якщо виникає помилка валідації або ORA-помилка під час масового виконання.
     *
     * @example
     * // Пакетна вставка користувачів
     * const users = [
     *   [1, 'Ivan'],
     *   [2, 'Maria'],
     *   [3, 'Petro']
     * ];
     *
     * const result = await db.executeMany(
     *   "INSERT INTO users (id, name) VALUES (:1, :2)",
     *   users,
     *   { autoCommit: true }
     * );
     * console.log(`Inserted rows: ${result.rowsAffected}`);
     *
     * @example
     * // Масова вставка за допомогою масиву об'єктів (іменовані параметри)
     * const usersData = [
     *   { userId: 1, userName: 'Олександр', userRole: 'admin' },
     *   { userId: 2, userName: 'Олена', userRole: 'editor' },
     *   { userId: 3, userName: 'Дмитро', userRole: 'user' }
     * ];
     *
     * try {
     *   const result = await db.executeMany(
     *     "INSERT INTO users (id, name, role) VALUES (:userId, :userName, :userRole)",
     *     usersData,
     *     {
     *       autoCommit: true,
     *       bindDefs: { // Рекомендовано для продуктивності та стабільності типів
     *         userId:   { type: oracledb.NUMBER },
     *         userName: { type: oracledb.STRING, maxSize: 100 },
     *         userRole: { type: oracledb.STRING, maxSize: 20 }
     *       }
     *     }
     *   );
     *   console.log(`Успішно вставлено рядків: ${result.rowsAffected}`);
     * } catch (err) {
     *   console.error('Помилка масової вставки:', err);
     * }
     *
     * @description
     * Офіційні рекомендації щодо пакетних операцій доступні в [Oracle Batch Statement Execution](https://node-oracledb.readthedocs.io).
     */
    async executeMany(sql, bindsArray = [], options = {}, internalCtx = {}) {
        const { connection, isLocal } = await this._acquireConnection(internalCtx)
        const combinedOptions = await this._mergeOptions(options, !isLocal)
        const start = internalCtx.startTime || Date.now()

        try {
            const result = await connection.executeMany(sql, bindsArray, combinedOptions)

            this.logger?.debug?.('Bulk SQL Executed', {
                count: bindsArray.length,
                duration: `${Date.now() - start}ms`,
            })

            return result
        } catch (error) {
            this.logger?.error?.('ExecuteMany Error', {
                sql: sql.trim(),
                count: bindsArray.length,
                message: error.message,
                offset: error.offset,
                traceId: internalCtx.traceId,
            })
            throw error
        } finally {
            await this._releaseConnection(connection, isLocal)
        }
    }

    /**
     * Виконує SQL-запит і повертає Readable Stream (Node.js) для ітерації по рядках.
     * Реалізує "розумне" керування ресурсами: з'єднання автоматично повертається в пул
     * лише після того, як основний потік рядків закінчився І всі LOB-об'єкти (BLOB/CLOB)
     * всередині цих рядків були повністю вичитані.
     *
     * @param {string} sql - SQL текст запиту.
     * @param {Object|Array} [params={}] - Bind-параметри для запиту.
     * @param {import('oracledb').ExecuteOptions} [options={}] - Опції виконання (напр. fetchInfo).
     * @param {InternalContext} [internalCtx={}] - Внутрішній контекст (для транзакцій).
     * @returns {Promise<import('stream').Readable>} Потік рядків, де кожен 'data' — це об'єкт рядка.
     *
     * @example
     * // Сценарій 1: Проста вибірка великої кількості рядків (Buffer Mode)
     * const stream = await db.queryStream("SELECT id, name FROM large_table");
     * stream.on('data', (row) => console.log(row.ID, row.NAME));
     *
     * @example
     * // Сценарій 2: Стрімінг одного або декількох BLOB-файлів (LOB Mode)
     * // Обов'язково вказуємо fetchInfo для колонки з файлом, щоб отримати потік (DEFAULT)
     * const qStream = await db.queryStream(
     *   "SELECT name, file_body FROM docs WHERE task_id = :id",
     *   { id: 123 },
     *   { fetchInfo: { "FILE_BODY": { type: oracledb.DEFAULT } } }
     * );
     *
     * qStream.on('data', (row) => {
     *   const out = fs.createWriteStream(`./temp/${row.NAME}`);
     *   row.FILE_BODY.pipe(out); // З'єднання закриється автоматично після завершення pipe
     * });
     *
     * @example
     * // Сценарій 3: Стрімінг безпосередньо в Express Response (HTTP Download)
     * // Цей метод дозволяє завантажити файл на 2 ГБ, використовуючи лише 20 МБ RAM.
     * app.get('/download/:id', async (req, res) => {
     *   const qs = await db.queryStream(
     *     "SELECT file_body, name FROM files WHERE id = :id",
     *     { id: req.params.id },
     *     { fetchInfo: { "FILE_BODY": { type: oracledb.DEFAULT } } }
     *   );
     *
     *   qs.on('data', (row) => {
     *     res.setHeader('Content-Disposition', `attachment; filename="${row.NAME}"`);
     *     row.FILE_BODY.pipe(res);
     *   });
     *
     *   qs.on('error', (err) => res.status(500).send(err.message));
     * });
     *
     * @example
     * // Сценарій 4: Безпечна послідовна обробка тисяч файлів (Backpressure)
     * // Використовуємо .pause() та .resume(), щоб обробляти файли по черзі.
     * const qs = await db.queryStream(
     *   "SELECT name, file_body FROM large_table",
     *   {},
     *   { fetchInfo: { "FILE_BODY": { type: oracledb.DEFAULT } } }
     * );
     *
     * qs.on('data', async (row) => {
     *   qs.pause(); // Зупиняємо читання нових рядків, поки обробляємо поточний файл
     *
     *   const dest = fs.createWriteStream(`./files/${row.NAME}`);
     *   row.FILE_BODY.pipe(dest);
     *
     *   row.FILE_BODY.on('end', () => {
     *     console.log(`Файл ${row.NAME} оброблено.`);
     *     qs.resume(); // Відновлюємо читання наступного рядка з бази
     *   });
     *
     *   row.FILE_BODY.on('error', () => qs.resume()); // Не забуваємо відновлювати при помилці
     * });
     *
     * @example
     * // Сценарій 5: Передача даних між різними модулями (Сервіс -> Контролер)
     * // Метод у файлі сервісу:
     * async function getFileMetadataAndStream(id) {
     *   const qs = await db.queryStream(
     *     "SELECT name, hash, DBMS_LOB.GETLENGTH(FILE_BODY) as sz, file_body FROM files WHERE id = :id",
     *     {id},
     *     { fetchInfo: { "FILE_BODY": { type: oracledb.DEFAULT } } }
     *   );
     *
     *   return new Promise((resolve, reject) => {
     *     qs.on('data', (row) => {
     *       resolve({
     *         name: row.NAME,
     *         hash: row.HASH,
     *         size: row.SZ,
     *         stream: row.FILE_BODY // Передаємо стрім далі
     *       });
     *       // Якщо нам потрібен лише один файл, можна зупинити основний потік
     *       // але конект не закриється, поки жив row.FILE_BODY (завдяки нашому лічильнику)
     *     });
     *     qs.on('error', reject);
     *     qs.on('end', () => resolve(null));
     *   });
     * }
     *
     * // Виклик у файлі контролера:
     * const fileInfo = await getFileMetadataAndStream(101);
     * if (fileInfo) {
     *   console.log(`Скачуємо ${fileInfo.name} (${fileInfo.size} байт)`);
     *   res.setHeader('X-SHA256', fileInfo.hash);
     *   fileInfo.stream.pipe(res);
     * }
     *
     * @example
     * // Сценарій 6: Пропуск (ігнорування) LOB-даних "в нікуди"
     * // Якщо ви отримали потік, але не хочете його зберігати, його треба "злити",
     * // щоб звільнити з'єднання з базою.
     * const qs = await db.queryStream(
     *   "SELECT id, file_body, status FROM tasks",
     *   {},
     *   { fetchInfo: { "FILE_BODY": { type: oracledb.DEFAULT } } }
     * );
     *
     * qs.on('data', (row) => {
     *   if (row.STATUS === 'SKIPPED') {
     *     console.log(`Пропускаємо файл для задачі ${row.ID}`);
     *
     *     // ВАРІАНТ А: Використання .resume()
     *     // Просто перемикає потік у режим читання без збереження даних.
     *     row.FILE_BODY.resume();
     *
     *     // ВАРІАНТ Б: Для старіших версій або повної впевненості
     *     // row.FILE_BODY.on('data', () => {}); // порожній обробник "з'їдає" дані
     *   } else {
     *     row.FILE_BODY.pipe(fs.createWriteStream(`task_${row.ID}.dat`));
     *   }
     * });
     *
     * @example
     * // Сценарій 7: Отримання ОДНОГО файлу з метаданими (Сервіс -> Контролер)
     * // Оптимально для HTTP-завантаження: спочатку заголовки, потім дані.
     *
     * // ФАЙЛ: FileService.js
     * async function getFileForDownload(id) {
     *   const qs = await db.queryStream(
     *     "SELECT name, hash, DBMS_LOB.GETLENGTH(FILE_BODY) as sz, file_body FROM files WHERE id = :id",
     *     {id},
     *     { fetchInfo: { "FILE_BODY": { type: oracledb.DEFAULT } } }
     *   );
     *
     *   return new Promise((resolve, reject) => {
     *     let found = false;
     *
     *     qs.on('data', (row) => {
     *       found = true;
     *
     *       // 1. Формуємо результат для повернення
     *       const result = {
     *         name: row.NAME,
     *         hash: row.HASH,
     *         size: row.SZ,
     *         stream: row.FILE_BODY
     *       };
     *
     *       // 2. ЗУПИНЯЄМО потік рядків, бо нам потрібен лише один рядок.
     *       // Це важливо для звільнення курсору Oracle.
     *       qs.destroy();
     *
     *       resolve(result);
     *     });
     *
     *     qs.on('error', (err) => {
     *       if (!found) reject(err);
     *     });
     *
     *     qs.on('end', () => {
     *       if (!found) resolve(null); // Файл не знайдено в базі
     *     });
     *   });
     * }
     *
     * // ФАЙЛ: FileController.js (Express)
     * async function download(req, res) {
     *   try {
     *     const fileInfo = await FileService.getFileForDownload(req.params.id);
     *
     *     if (!fileInfo) return res.status(404).send('Not Found');
     *
     *     // Сценарій А: Все добре - стрімимо в браузер
     *     if (req.query.verify === 'true') {
     *        res.setHeader('Content-Length', fileInfo.size);
     *        res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.name}"`);
     *        fileInfo.stream.pipe(res);
     *     }
     *     // Сценарій Б: Нам передумали качати (наприклад, перевірка прав не пройшла)
     *     else {
     *        console.log('Скасування: викачуємо в нікуди, щоб звільнити конект');
     *        fileInfo.stream.resume(); // <--- ОБОВ'ЯЗКОВО, щоб не завис конект!
     *        res.status(403).send('Forbidden');
     *     }
     *   } catch (err) {
     *     res.status(500).send(err.message);
     *   }
     * }
     *
     * @throws {Error} Якщо з'єднання не вдалося встановити або SQL синтаксично некоректний.
     */
    async queryStream(sql, params = {}, options = {}, internalCtx = {}) {
        const { connection, isLocal } = await this._acquireConnection(internalCtx)
        const combinedOptions = await this._mergeOptions(options, !isLocal)

        try {
            this.logger?.debug?.('Starting Stream', { sql, traceId: internalCtx.traceId })

            const stream = connection.queryStream(sql, params, combinedOptions)

            let activeLobs = 0
            let streamFinished = false

            // Універсальна функція спроби закриття
            const attemptRelease = async (origin) => {
                // Закриваємо лише якщо:
                // 1. Стрім рядків вичерпано (end/error/close)
                // 2. Немає активних читань LOB-ів у цих рядках
                if (streamFinished && activeLobs <= 0 && isLocal) {
                    this.logger?.debug?.(`Releasing connection from ${origin}`, {
                        traceId: internalCtx.traceId,
                    })
                    await this._releaseConnection(connection, isLocal)
                }
            }

            stream.on('data', (row) => {
                // Знаходимо всі LOB-поля (BLOB/CLOB) у поточному рядку
                const lobs = Object.values(row).filter((v) => v && v.constructor.name === 'Lob')

                lobs.forEach((lob) => {
                    activeLobs++

                    const onLobFinish = async () => {
                        activeLobs--
                        await attemptRelease('lob_finish')
                    }

                    // Кожен окремий файл у рядку має закінчитися
                    lob.on('end', onLobFinish)
                    lob.on('close', onLobFinish)
                    lob.on('error', async (err) => {
                        this.logger?.error?.('LOB inside row error', {
                            error: err.message,
                            traceId: internalCtx.traceId,
                        })
                        await onLobFinish()
                    })
                })
            })

            stream.on('end', async () => {
                streamFinished = true
                await attemptRelease('stream_end')
            })

            stream.on('close', async () => {
                streamFinished = true
                await attemptRelease('stream_close')
            })

            stream.on('error', async (err) => {
                this.logger?.error?.('Main QueryStream error', {
                    error: err.message,
                    traceId: internalCtx.traceId,
                })
                streamFinished = true
                await attemptRelease('stream_error')
            })

            return stream
        } catch (error) {
            this.logger?.error?.('Failed to initiate stream', {
                error: error.message,
                traceId: internalCtx.traceId,
            })
            if (isLocal) {
                await this._releaseConnection(connection, isLocal)
            }
            throw error
        }
    }

    /**
     * Виконує групу операцій у межах однієї транзакції.
     *
     * Метод гарантує:
     * 1. Використання одного і того ж з'єднання для всіх запитів.
     * 2. Автоматичний `COMMIT` у разі успішного завершення всіх операцій.
     * 3. Автоматичний `ROLLBACK` у разі виникнення будь-якої помилки.
     * 4. Закриття з'єднання після завершення (навіть якщо стався збій).
     *
     * @async
     * @param {function(TransactionContext): Promise<any>} callbackFn - Асинхронна функція,
     * що приймає об'єкт контексту з транзакційними методами.
     *
     * @returns {Promise<any>} Повертає результат, який повертає `callbackFn`.
     *
     * @throws {Error} Перекидає помилку, якщо будь-яка операція всередині або сам COMMIT/ROLLBACK завершилися невдало.
     *
     * @example
     * const result = await db.withTransaction(async (tx) => {
     *     // Усі ці запити виконаються в одній транзакції
     *     await tx.execute("INSERT INTO logs (msg) VALUES (:1)", ['Початок операції']);
     *
     *     const user = await tx.findOne("SELECT balance FROM accounts WHERE id = :id", { id: 1 });
     *
     *     if (user.BALANCE < 100) {
     *         throw new Error('Недостатньо коштів'); // Викличе автоматичний ROLLBACK
     *     }
     *
     *     await tx.execute("UPDATE accounts SET balance = balance - 100 WHERE id = 1");
     *     return 'Гроші переказано'; // Викличе автоматичний COMMIT
     * });
     *
     * @see {@link https://node-oracledb.readthedocs.io Transaction Management in Oracle}
     */
    async withTransaction(callbackFn) {
        // Для транзакції ми ЗАВЖДИ створюємо локальне з'єднання (isLocal: true)
        const { connection, isLocal } = await this._acquireConnection({})
        const startTime = Date.now()
        const traceId = `trId-${Math.random().toString(36).substring(2, 11)}`

        const internalCtx = {
            connection: connection,
            traceId,
            startTime,
        }

        try {
            this.logger?.debug?.('Transaction Started', { traceId })

            const ctx = {
                // прямий доступ для особливих випадків
                conn: connection,
                //
                execute: (sql, binds, opts) => {
                    return this.execute(sql, binds, { ...opts, autoCommit: false }, internalCtx)
                },
                executeMany: (sql, binds, opts) => {
                    return this.executeMany(sql, binds, { ...opts, autoCommit: false }, internalCtx)
                },
                select: (sql, binds, opts) => {
                    return this.select(sql, binds, { ...opts, autoCommit: false }, internalCtx)
                },
                findOne: (sql, binds, opts) => {
                    return this.findOne(sql, binds, { ...opts, autoCommit: false }, internalCtx)
                },
                queryStream: (sql, binds, opts) => {
                    return this.queryStream(sql, binds, { ...opts, autoCommit: false }, internalCtx)
                },
                uploadBlob: (sql, binds, opts, stream) => {
                    return this.uploadBlob(
                        sql,
                        binds,
                        { ...opts, autoCommit: false },
                        stream,
                        internalCtx,
                    )
                },
            }

            const result = await callbackFn(ctx)

            await connection.commit()

            this.logger?.info?.('Transaction Committed', {
                traceId,
                duration: `${Date.now() - startTime}ms`,
            })

            return result
        } catch (error) {
            if (connection) {
                await connection.rollback()
            }
            this.logger?.error?.('Transaction failed (Rolled Back)', {
                error: error.message,
                traceId,
            })
            throw error
        } finally {
            await this._releaseConnection(connection, isLocal)
        }
    }

    /**
     * Виконує запит SELECT та повертає масив результатів.
     *
     * Зручна обгортка над {@link execute}, яка повертає лише дані рядків.
     *
     * @async
     * @param {string} sql - SQL текст запиту.
     * @param {Object|Array} [params={}] - Bind параметри.
     * @param {import('oracledb').ExecuteOptions} [options={}] - Опції виконання.
     * @param {InternalContext} [internalCtx={}] - Внутрішній контекст (traceId, connection тощо).
     *
     * @returns {Promise<Object[]>} Масив об'єктів (рядків), або порожній масив, якщо нічого не знайдено.
     *
     * @example
     * const users = await db.select("SELECT id, name FROM users WHERE role = :role", { role: 'admin' });
     * console.log(users.length); // 3
     */
    async select(sql, params = {}, options = {}, internalCtx = {}) {
        const result = await this.execute(sql, params, options, internalCtx)
        return result.rows || []
    }

    /**
     * Отримує лише один (перший) запис із результатів запиту.
     *
     * Автоматично додає опцію `maxRows: 1` для оптимізації вибірки на рівні драйвера.
     *
     * @async
     * @param {string} sql - SQL текст запиту.
     * @param {Object|Array} [params={}] - Bind параметри.
     * @param {import('oracledb').ExecuteOptions} [options={}] - Опції виконання.
     * @param {InternalContext} [internalCtx={}] - Внутрішній контекст.
     *
     * @returns {Promise<Object|null>} Об'єкт рядка або `null`, якщо запис не знайдено.
     *
     * @example
     * const user = await db.findOne("SELECT * FROM users WHERE id = :id", { id: 505 });
     * if (user) {
     *   console.log(user.NAME);
     * }
     */
    async findOne(sql, params = {}, options = {}, internalCtx = {}) {
        const rows = await this.select(sql, params, { ...options, maxRows: 1 }, internalCtx)
        return rows[0] || null
    }

    /**
     * Виконує потокове завантаження великих об'єктів (BLOB або CLOB) у базу даних.
     *
     * Метод використовує механізм DML з поверненням дескриптора LOB (`RETURNING INTO`),
     * що дозволяє передавати дані частинами (через `pipe`), мінімізуючи використання оперативної пам'яті.
     *
     * @async
     * @param {string} sql - SQL-запит (INSERT або UPDATE), що містить конструкцію `RETURNING ... INTO :lobbv`.
     * @param {Object} params - Параметри запиту. Обов'язково має включати опис для `:lobbv`.
     * @param {import('oracledb').BindParameter} params.lobbv - Опис вихідного параметру (наприклад, `{ type: oracledb.BLOB, dir: oracledb.BIND_OUT }`).
     * @param {import('stream').Readable} sourceStream - Вхідний потік даних (наприклад, `fs.createReadStream` або `http.IncomingMessage`).
     * @param {InternalContext} [internalCtx={}] - Внутрішній контекст для трасування та керування з'єднанням.
     *
     * @returns {Promise<boolean>} Повертає `true` у разі успішного завершення завантаження та коміту.
     *
     * @throws {Error} Якщо не знайдено LOB-дескриптор, сталася помилка передачі даних або помилка БД.
     *
     * @example
     * // Завантаження файлу з диска в колонку BLOB
     * import fs from 'fs'
     * const stream = fs.createReadStream('./photos/avatar.jpg');
     *
     * try {
     *   await db.uploadBlob(
     *     "UPDATE users SET avatar = EMPTY_BLOB() WHERE id = :uid RETURNING avatar INTO :lobbv",
     *     {
     *       uid: 123,
     *       lobbv: { type: oracledb.BLOB, dir: oracledb.BIND_OUT }
     *     },
     *     stream
     *   );
     *   console.log('Аватар успішно оновлено');
     * } catch (err) {
     *   console.error('Помилка завантаження:', err);
     * }
     *
     * @example
     * const source = fs.createReadStream('video.mp4');
     * await db.uploadBlob(
     *   "UPDATE media SET content = EMPTY_BLOB() WHERE id = 1 RETURNING content INTO :lobbv",
     *   { lobbv: { type: oracledb.BLOB, dir: oracledb.BIND_OUT } },
     *   source
     * );
     *
     * @description
     * Більше деталей щодо запису LOB дивіться у [Oracle Node.js Driver Guide](https://node-oracledb.readthedocs.io).
     */
    async uploadBlob(sql, params, options = {}, sourceStream, internalCtx = {}) {
        // 1. Отримуємо з'єднання (якщо є в ctx — беремо його, isLocal буде false)
        const { connection, isLocal } = await this._acquireConnection(internalCtx)
        const startTime = internalCtx.startTime || Date.now()

        // Створюємо новий контекст, передаючи туди наше з'єднання
        const executionCtx = {
            ...internalCtx,
            connection,
            isLocal,
            startTime,
        }

        try {
            // 2. Викликаємо старий execute. Завдяки isLocal=false у ctx, execute не закриє conn.
            // Оскільки ми передали conn, execute (всередині _acquireConnection)
            // має зрозуміти, що з'єднання не локальне і НЕ закривати його в finally.
            const result = await this.execute(sql, params, options, executionCtx)

            // Отримуємо LOB з outBinds (враховуючи, що результат може бути масивом або об'єктом)
            const lob =
                result.outBinds?.lobbv ||
                (Array.isArray(result.outBinds) ? result.outBinds[0] : null)

            // --- 3. Валідація LOB ---
            if (!lob) {
                throw new Error('LOB bind out failed: check RETURNING ... INTO :lobbv in your SQL')
            }

            if (typeof lob.setEncoding === 'function' && params.lobbv?.type === oracledb.CLOB) {
                lob.setEncoding('utf8')
            }

            // --- 4. Стрімінг даних у базу ---
            // Використовуємо вбудований метод pipe для передачі даних у Lob-дескриптор
            await new Promise((resolve, reject) => {
                // Функція очищення обробників, щоб не було витоків пам'яті
                const cleanup = () => {
                    sourceStream.removeListener('error', onError)
                    lob.removeListener('error', onError)
                    lob.removeListener('finish', onFinish)
                }

                const onFinish = () => {
                    cleanup()
                    resolve()
                }

                const onError = (err) => {
                    cleanup()
                    // Примусово зупиняємо стріми у разі помилки
                    sourceStream.unpipe(lob)
                    // Знищуємо дескриптор, щоб зупинити запис в Oracle
                    if (typeof lob.destroy === 'function') lob.destroy()
                    reject(err)
                }

                lob.on('error', onError)
                lob.on('finish', onFinish)
                sourceStream.on('error', onError)

                sourceStream.pipe(lob)
            })

            // 5. Фіксація транзакції, якщо ми її почали
            if (isLocal) {
                await connection.commit()
            }

            return result
        } catch (error) {
            // Відкат, якщо з'єднання локальне і сталася помилка стрімінгу або SQL
            if (isLocal && connection) {
                await connection.rollback()
            }
            throw error
        } finally {
            // 6. ЗАВЖДИ звільняємо з'єднання в кінці
            await this._releaseConnection(connection, isLocal)
        }
    }

    /**
     * Універсальний метод для отримання LOB (BLOB/CLOB) з підтримкою Range та Streaming.
     *
     * @description
     * Метод автоматично обирає стратегію читання:
     * 1. **Buffer** (через `getData`) — для невеликих даних або Range-запитів до порогу `memoryThreshold`.
     * 2. **Stream** (через `pipe`) — для великих файлів, щоб уникнути перевантаження RAM.
     * Автоматично встановлює UTF-8 для CLOB та гарантує звільнення з'єднання навіть при обриві запиту клієнтом.
     *
     * @param {string} sql - SQL запит (SELECT), що повертає LOB-колонку.
     * @param {Object} [params={}] - Параметри зв'язування (bind variables) для SQL.
     * @param {Object} [options={}] - Опції виконання запиту oracledb.execute.
     * @param {Object|null} [range=null] - Об'єкт діапазону для часткового читання.
     * @param {number} [range.offset=0] - Зміщення в байтах від початку файлу (0-based).
     * @param {number} [range.length] - Кількість байтів, які потрібно прочитати.
     * @param {number} [range.chunkSize=524288] - Розмір одного шматка вичитування з БД (дефолт 512KB).
     * @param {Object} [internalCtx={}] - Внутрішній контекст (traceId, connection тощо).
     * @param {number} [memoryThreshold=10485760] - Поріг пам'яті (дефолт 10MB). Якщо запит менший за поріг, повернеться Buffer.
     *
     * @returns {Promise<{ row: Object, data: Buffer|string|import('stream').Readable, type: 'buffer'|'stream' }>}
     * Об'єкт, що містить рядок з БД, дані та тип (buffer або stream).
     *
     * @example
     * // Приклад 1: Просте скачування файлу в Express (Скачування всього файлу без параметрів range)
     * const { data: stream, row, type } = await db.downloadBlob("SELECT content, mime_type FROM docs WHERE id = :id", {id: 123});
     * res.set('Content-Type', row.MIME_TYPE);
     * // ЗАХИСТ: Якщо клієнт розірвав з'єднання (закрив вкладку)
     * res.on('close', () => {
     *     if (streama && typeof stream.destroy === 'function') {
     *         // Знищуємо стрім. Це запустить releaseOnce у downloadBlob
     *         stream.destroy();
     *     }
     * });
     *
     * if (Buffer.isBuffer(stream)) {
     *      // Якщо це Buffer — використовуємо end()
     *      res.end(stream);
     * } else {
     *      // Якщо це Stream — використовуємо pipe()
     *      stream.pipe(res);
     * }
     *
     *  @example
     * // Приклад 2: Скачування конкретного діапазону для відео (Range Request)
     * const result = await service.downloadBlob(
     *   'SELECT video_data FROM videos WHERE id = :id',
     *   { id: 123 },
     *   {},
     *   { offset: 5000, length: 1048576, chunkSize: 256 * 1024 }
     * );
     * if (result.type === 'stream') result.data.pipe(res);
     *
     * @example
     * // Приклад 3: Range-запит (читання конкретного шматка 1КБ)
     * const range = { offset: 500, length: 1024 };
     * const { data: buffer } = await db.downloadBlob(sql, params, {}, range);
     * console.log('Отримано байтів:', buffer.length);
     */
    async downloadBlob(
        sql,
        params = {},
        options = {},
        // Задаємо дефолтні значення прямо в деструктуризації
        { offset = 0, length = null, chunkSize = 512 * 1024 } = {},
        internalCtx = {},
        memoryThreshold = 10 * 1024 * 1024,
    ) {
        // 1. Отримання з'єднання (враховуючи транзакційний контекст)
        const { connection, isLocal } = await this._acquireConnection(internalCtx)
        const executionCtx = { ...internalCtx, connection, isLocal }

        try {
            // 2. Виконання запиту через базовий execute класу
            const result = await this.execute(sql, params, options, executionCtx)
            const row = result.rows?.[0]
            if (!row) throw new Error('Record not found')

            // Знаходимо першу колонку, яка є LOB-об'єктом
            const lob = Object.values(row).find(
                (col) => col && (typeof col.getData === 'function' || col.pipe),
            )
            if (!lob) throw new Error('LOB column not found in result set')

            // --- 3. Валідація LOB ---
            if (lob === undefined) {
                throw new Error('LOB column not found in result set. Check your SELECT statement.')
            }

            if (lob === null) {
                // Якщо в базі фізичний NULL, повертаємо порожній Buffer
                await this._releaseConnection(conn, isLocal)
                return { row, data: Buffer.alloc(0), type: 'buffer' }
            }

            if (typeof lob.getData !== 'function' && !lob.pipe) {
                throw new Error('Column found but it is not a valid LOB descriptor')
            }

            // --- 4. Налаштування типу (UTF-8 для CLOB) ---
            // Для CLOB при Range-запитах краще НЕ ставити UTF-8, щоб рахувати в байтах.
            // Але якщо ви впевнені, що offset/length у вас в СИМВОЛАХ — залиште кодування.
            if (lob.type === oracledb.CLOB) {
                lob.setEncoding('utf8')
            }

            // Визначаємо стратегію: якщо запит малий — читаємо в пам'ять (getData)
            const isRangeRequest = range && range.length !== undefined
            const useBuffer = isRangeRequest && range.length <= memoryThreshold

            // --- СТРАТЕГІЯ 1: Читання в Buffer/String (getData) ---
            if (useBuffer) {
                const start = /*range.*/ (offset || 0) + 1 // Oracle 1-based offset
                const amount = /*range.*/ length

                const data = await lob.getData(start, amount)

                // Обов'язково звільняємо ресурси LOB та з'єднання
                if (typeof lob.destroy === 'function') lob.destroy()
                // Відразу звільняємо з'єднання, дані вже в RAM
                await this._releaseConnection(connection, isLocal)
                return { row, data, type: 'buffer' }
            }

            // --- СТРАТЕГІЯ 2: Streaming (outputStream) ---
            let stream = lob

            // // Якщо це великий Range, що перевищує поріг
            // if (isRangeRequest) {
            //     let totalProcessed = 0 // Скільки всього пройшло крізь стрім
            //     let totalSent = 0 // Скільки реально віддано в діапазоні
            //     const start = range.offset || 0
            //     const limit = range.length
            //     const end = start + limit

            //     // --- 1. Оптимізація драйвера (Перша лінія захисту) ---
            //     // Вказуємо зміщення (Oracle 1-based)
            //     lob.offset = start + 1

            //     // Вказуємо оптимальний розмір чанка(pieceSize).
            //     // Якщо ліміт малий, ставимо pieceSize рівним ліміту, щоб прочитати за один раз.
            //     // Якщо великий — ставимо стандартні 64КБ або ліміт.
            //     lob.pieceSize = Math.min(limit, 64 * 1024)

            //     totalProcessed = start // Починаємо відлік з offset, бо lob.offset змістив потік
            //     totalSent = 0

            //     // --- 2. Запобіжник Transform (Друга лінія захисту) ---
            //     const rangeSlicer = new Transform({
            //         // Вказуємо, що ми можемо працювати і з рядками, і з буферами
            //         decodeStrings: false,
            //         //
            //         transform(chunk, encoding, callback) {
            //             // chunk може бути Buffer (BLOB) або String (CLOB)
            //             const isBuffer = Buffer.isBuffer(chunk)
            //             const chunkLen = chunk.length

            //             const chunkStart = totalProcessed // Позиція початку поточного шматка
            //             const chunkEnd = totalProcessed + chunk.length // Позиція кінця поточного шматка
            //             totalProcessed += chunk.length // Оновлюємо лічильник для наступного шматка

            //             // 1. Пропускаємо, якщо ще не дійшли до start
            //             // Пропускаємо дані до початку Range
            //             if (chunkEnd <= start) return callback()

            //             // 2. Дострокова зупинка (якщо цей чанк повністю ПОЗА межами)
            //             // Якщо початок поточного шматка вже дорівнює або більший за end — ми закінчили.
            //             if (chunkStart >= end || totalSent >= limit) {
            //                 // ПРИМУСОВО ЗУПИНЯЄМО ORACLE
            //                 this.push(null) // Закриваємо вихідний стрім для клієнта
            //                 if (typeof lob.destroy === 'function') {
            //                     lob.destroy() // Сигнал базі даних припинити читку
            //                 }
            //                 return callback()
            //             }

            //             // 3. Вираховуємо межі вирізки для поточного шматка
            //             // Наприклад: Range 5000-6000. Шматок прийшов 4000-12000.
            //             const sliceStart = Math.max(0, start - chunkStart) // Де почати різати всередині шматка
            //             const sliceEnd = Math.min(chunkLen, end - chunkStart) // Де закінчити різати

            //             // Використовуємо правильний метод для типу даних
            //             const partial = isBuffer
            //                 ? chunk.subarray(sliceStart, sliceEnd) // Для BLOB (швидко, без копіювання пам'яті)
            //                 : chunk.slice(sliceStart, sliceEnd) // Для CLOB (текстова вирізка символів)

            //             if (partial.length > 0) {
            //                 totalSent += partial.length
            //                 this.push(partial)
            //             }

            //             // 4. ЗАХИСТ: Зупинка після push (якщо ліміт досягнуто на цьому чанку)
            //             if (totalSent >= limit) {
            //                 this.push(null) // Закриваємо наш трансформ-стрім для клієнта
            //                 if (typeof lob.destroy === 'function') {
            //                     // Даємо сигнал Oracle припинити читку з бази
            //                     lob.destroy()
            //                 }
            //             }

            //             callback()
            //         },
            //     })

            //     stream = lob.pipe(rangeSlicer)
            // }

            // Якщо це великий Range, що перевищує поріг
            if (isRangeRequest) {
                const start = /*range.*/ (offset || 0) + 1 // Oracle 1-based offset
                const totalBytesToRead = /*range.*/ length
                // const chunkSize = 512 * 1024 // 512KB

                const rangeGenerator = async function* () {
                    let bytesProcessed = 0
                    try {
                        while (bytesProcessed < totalBytesToRead) {
                            const remaining = totalBytesToRead - bytesProcessed
                            const amountToRead = Math.min(chunkSize, remaining)

                            // getData робить "seek" на рівні БД, ігноруючи все, що було до offset
                            const chunk = await lob.getData(start + bytesProcessed, amountToRead)

                            if (!chunk || chunk.length === 0) break

                            yield chunk
                            bytesProcessed += chunk.length
                        }
                    } finally {
                        // Звільняємо дескриптор LOB в Oracle після виходу з циклу
                        if (lob && typeof lob.destroy === 'function') {
                            try {
                                lob.destroy()
                            } catch (e) {}
                        }
                    }
                }

                // Readable.from автоматично створює стрім, що підтримує backpressure
                stream = Readable.from(rangeGenerator())
            }

            let isReleased = false
            /**
             * Гарантує одноразове звільнення з'єднання та знищення LOB
             */
            const releaseOnce = async () => {
                if (isReleased) return
                isReleased = true

                try {
                    // Важливо: знищуємо саме оригінальний lob для зупинки вибірки в DB
                    if (lob && typeof lob.destroy === 'function') {
                        lob.destroy() // Негайно звільняє ресурси на стороні Oracle C-драйвера
                    }
                } catch (error) {}

                await this._releaseConnection(connection, isLocal)
            }

            //
            stream.on('data', (chunk) => {})

            // Реєстрація обробників завершення стріму
            stream.on('end', releaseOnce) // Стрім закінчився успішно
            stream.on('close', releaseOnce) // З'єднання розірвано (наприклад, клієнт закрив плеєр)
            stream.on('error', async (err) => {
                this.logger?.error?.('LOB Stream Error', {
                    sql: sql.trim().substring(0, 50),
                    message: err.message,
                    traceId: internalCtx.traceId,
                })
                await releaseOnce()
            })

            return { row, data: stream, type: 'stream' }
        } catch (error) {
            // Якщо впали до передачі стріму назовні — закриваємо з'єднання
            await this._releaseConnection(connection, isLocal)
            throw error
        }
    }

    /**
     * Виконує запит для отримання одного рядка з автоматичною підтримкою LOB-потоків (BLOB/CLOB).
     *
     * **Механіка керування з'єднанням:**
     * - Якщо запит містить LOB-колонки, локальне з'єднання залишається відкритим до моменту
     *   повного завершення читання всіх потоків (події `end`, `close` або `error`).
     * - Для CLOB автоматично встановлюється кодування `utf8`.
     * - Якщо метод викликано в рамках існуючої транзакції (через `internalCtx`), закриття з'єднання не виконується.
     *
     * @async
     * @param {string} sql - SQL-запит (SELECT).
     * @param {Object|Array} [params={}] - Bind-параметри для запиту.
     * @param {Object} [options={}] - Опції виконання `conn.execute`.
     * @param {Object} [options.fetchInfo] - Опис метаданих (наприклад, `{"COL": {type: oracledb.DEFAULT}}` для активації стрімінгу).
     * @param {InternalContext} [internalCtx={}] - Внутрішній контекст для трасування та керування сесією.
     *
     * @returns {Promise<Object|null>} Повертає об'єкт рядка (зазвичай з UPPERCASE ключами) або `null`.
     *
     * @throws {Error} Якщо виникла помилка підключення, виконання SQL або ініціалізації потоків.
     *
     * @example
     * // Використання з fetchInfo для отримання BLOB-стріму
     * const row = await db.fetchWithLobs(
     *   "SELECT name, body FROM files WHERE id = :id",
     *   { id: 101 },
     *   { fetchInfo: { "BODY": { type: oracledb.DEFAULT } } }
     * );
     *
     * if (row) {
     *   // row.BODY - це Oracle Lob Stream. Коли він закінчиться (pipe end),
     *   // метод автоматично звільнить з'єднання в пул.
     *   row.BODY.pipe(res);
     * }
     */
    async fetchWithLobs(sql, params = {}, options = {}, internalCtx = {}) {
        const { connection, isLocal } = await this._acquireConnection(internalCtx)
        const combinedOptions = await this._mergeOptions(options, !isLocal)
        const traceId = internalCtx.traceId || `lob-rd-${Math.random().toString(36).slice(2, 9)}`

        try {
            const result = await connection.execute(sql, params, {
                ...combinedOptions,
                autoCommit: false,
            })

            const row = result.rows ? result.rows[0] : null

            if (!row) {
                if (isLocal) await connection.close()
                return null
            }

            // Автоматично знаходимо всі Lob-об'єкти в отриманому рядку
            const lobs = Object.values(row).filter((v) => v && v.constructor.name === 'Lob')

            if (lobs.length > 0 && isLocal) {
                this.logger?.debug?.(`Tracking ${lobs.length} LOBs from row`, { traceId })

                // Чекаємо завершення всіх потоків через стандартні події
                let activeLobs = lobs.length
                let isClosed = false

                const cleanup = async () => {
                    activeLobs--

                    if (activeLobs <= 0 && !isClosed) {
                        try {
                            await connection.close()
                            this.logger?.debug?.('LOB connection released', { traceId })
                        } catch (err) {
                            this.logger?.error?.('LOB close error', { error: err.message, traceId })
                        }
                    }
                }

                lobs.forEach((lob) => {
                    // 1. Визначаємо кодування залежно від типу LOB
                    if (lob.type === oracledb.CLOB) {
                        this.logger?.debug?.('Processing CLOB - setting encoding to utf8')
                        lob.setEncoding('utf8') // Отримуватимемо 'string' замість Buffer
                    } else if (lob.type === oracledb.BLOB) {
                        this.logger?.debug?.('Processing BLOB - binary mode')
                        // Для BLOB кодування не ставимо, отримуємо Buffer
                    }

                    // 2. Далі йде ваша логіка cleanup
                    let done = false
                    const onDone = () => {
                        if (done) return
                        done = true
                        cleanup()
                    }

                    lob.on('error', (err) => {
                        this.logger?.error?.('LOB Stream error', { error: err.message, traceId })
                        onDone()
                    })
                    lob.on('end', () => {
                        lob.destroy()
                        onDone()
                    })
                    lob.on('close', onDone)
                })
            } else if (isLocal) {
                await connection.close()
            }

            return row
        } catch (error) {
            if (isLocal && connection) {
                await connection.close()
            }
            throw error
        }
    }

    // --- Методи автентифікації та безпеки ---

    /**
     * Перевіряє облікові дані користувача та повертає деталізований результат.
     *
     * Використовуйте цей метод, якщо вам потрібно знати точну причину відмови
     * (наприклад, пароль застарів, аккаунт заблоковано або невірний логін).
     *
     * @async
     * @param {string} user - Ім'я користувача.
     * @param {string} password - Пароль.
     * @returns {Promise<AuthResult>} Об'єкт з прапорцем успіху та метаданими помилки.
     *
     * @example
     * const auth = await db.authenticateUserDetail('MY_USER', 'wrong_pass');
     * if (!auth.success) {
     *     if (auth.errorCode === 'ORA-01017') console.error('Пароль невірний');
     *     if (auth.errorCode === 'ORA-28000') console.error('Аккаунт заблоковано');
     * }
     */
    async authenticateUser(user, password) {
        try {
            // Намагаємося підключитися напряму (не через загальний пул)
            const connection = await this.oracledb.getConnection({
                user,
                password,
                connectString: this.config.connectString,
            })
            await connection.close()
            this.logger?.info?.('User authenticated via Oracle', { user })
            return { success: true, errorCode: null, message: null }
        } catch (err) {
            // Витягуємо ORA-код помилки (наприклад, ORA-01017)
            const oraCode = err.message?.match(/ORA-\d+/)?.[0] || 'UNKNOWN'

            this.logger?.warn?.('Oracle authentication failed', {
                user,
                error: err.message,
                oraCode,
            })

            return {
                success: false,
                errorCode: oraCode,
                message: err.message,
            }
        }
    }

    /**
     * Змінює пароль користувача в базі даних Oracle.
     *
     * Метод використовує вбудовану можливість драйвера `newPassword`, що дозволяє змінити
     * пароль під час встановлення з'єднання. Це працює навіть якщо термін дії поточного
     * пароля вже закінчився (статус "expired").
     *
     * @async
     * @param {string} user - Ім'я користувача (Schema name).
     * @param {string} oldPassword - Поточний пароль користувача.
     * @param {string} newPassword - Новий пароль, який відповідає політиці безпеки БД.
     *
     * @returns {Promise<boolean>} Повертає `true`, якщо пароль успішно змінено.
     *
     * @throws {Error} Викидає помилку Oracle, якщо:
     * - `oldPassword` невірний (наприклад, **ORA-01017**).
     * - `newPassword` не відповідає вимогам складності (наприклад, **ORA-28003**).
     * - Користувача заблоковано (наприклад, **ORA-28000**).
     *
     * @example
     * try {
     *   await db.changeOwnPassword('APP_USER', 'OldPass123!', 'NewSecurePass456$');
     *   console.log('Пароль оновлено успішно');
     * } catch (err) {
     *   if (err.message.includes('ORA-28003')) {
     *     console.error('Новий пароль занадто простий');
     *   } else {
     *     console.error('Помилка зміни пароля:', err.message);
     *   }
     * }
     *
     * @description
     * Докладніше про зміну пароля через драйвер можна дізнатися в [Node-oracledb Documentation](https://node-oracledb.readthedocs.io).
     */
    async changeOwnPassword(user, oldPassword, newPassword) {
        try {
            // Метод changePassword не потребує відкритого з'єднання,
            // він працює під час встановлення зв'язку
            const connection = await this.oracledb.getConnection({
                user,
                password: oldPassword,
                connectString: this.config.connectString,
                newPassword,
            })
            await connection.close()
            this.logger?.info?.('Password changed successfully by user', { user })
            return true
        } catch (err) {
            this.logger?.error?.('Failed to change password', { user, error: err.message })
            throw err
        }
    }

    /**
     * Змінює пароль будь-якого користувача бази даних (вимагає прав DBA або ALTER USER).
     *
     * **Увага:** Оскільки Oracle не підтримує bind-параметри для команди `ALTER USER`,
     * метод використовує динамічну генерацію SQL. Для запобігання SQL-ін'єкціям реалізовано
     * сувору перевірку вхідних даних за допомогою регулярних виразів.
     *
     * @async
     * @param {string} targetUser - Ім'я користувача, чий пароль потрібно скинути.
     * @param {string} newPassword - Новий пароль.
     *
     * @returns {Promise<boolean>} Повертає `true` у разі успішного виконання команди.
     *
     * @throws {Error} Викидає помилку, якщо:
     * - Вхідні дані містять недозволені символи (захист від ін'єкцій).
     * - Поточний користувач не має достатніх прав (наприклад, **ORA-01031**).
     * - Користувача `targetUser` не існує (наприклад, **ORA-01918**).
     *
     * @example
     * try {
     *   await db.adminResetPassword('REPORT_USER', 'TemporarY_Pass_2024');
     *   console.log('Пароль успішно скинуто адміністратором');
     * } catch (err) {
     *   console.error('Помилка скидання пароля:', err.message);
     * }
     *
     * @description
     * Більше про керування користувачами читайте у [Oracle SQL Reference: ALTER USER](https://docs.oracle.com).
     */
    async adminResetPassword(targetUser, newPassword) {
        // Запобігаємо SQL Injection, валідуючи ім'я користувача (Oracle ідентифікатори)
        if (!/^[a-zA-Z0-9_$]+$/.test(targetUser) || !/^[a-zA-Z0-9_$#]+$/.test(newPassword)) {
            throw new Error('Insecure characters in username or password')
        }

        // Пароль краще передавати через змінні, але в ALTER USER він іде як текст.
        // Ми використовуємо лапки для безпеки ідентифікаторів.
        const sql = `ALTER USER "${targetUser.toUpperCase()}" IDENTIFIED BY "${newPassword}"`

        try {
            // Виконуємо через адміністративний пул (або поточне з'єднання)
            await this.execute(sql)
            this.logger?.info?.('Administrator reset password', { targetUser })
            return true
        } catch (err) {
            this.logger?.error?.('Admin reset password failed', { targetUser, error: err.message })
            throw err
        }
    }

    // --- Системні методи ---

    /**
     * Виконує перевірку працездатності підключення до бази даних (Liveness Probe).
     *
     * Метод виконує максимально легкий запит `SELECT 1 FROM DUAL`.
     * Якщо база даних не відповідає протягом 1.5 секунди або виникає помилка підключення,
     * стан вважається непрацездатним.
     *
     * @async
     * @returns {Promise<boolean>}
     * `true` — база даних активна та приймає запити;
     * `false` — виникла помилка або перевищено час очікування (timeout).
     *
     * @example
     * // Використання в Express.js для Health Check маршруту
     * app.get('/health', async (req, res) => {
     *     const isAlive = await db.isHealthy();
     *     isAlive ? res.status(200).send('OK') : res.status(503).send('Database Unavailable');
     * });
     *
     * @description
     * Використання швидкого запиту до системної таблиці `DUAL` є стандартом для моніторингу Oracle.
     * Параметр `timeout` запобігає зависанню перевірки при мережевих проблемах.
     * Докладніше про [Oracle DUAL Table](https://docs.oracle.com).
     */
    async isHealthy() {
        try {
            // Використовуємо короткий тайм-аут, щоб Health Check не блокував систему
            await this.execute('SELECT 1 FROM DUAL', {}, { timeout: 1500 })
            return true
        } catch (err) {
            this.logger?.error?.('Health Check failed', { error: err.message })
            return false
        }
    }

    /**
     * Коректно завершує роботу пулу з'єднань Oracle (Graceful Shutdown).
     *
     * Метод ініціює процес закриття пулу, очікуючи завершення активних запитів.
     * Якщо в пулі є активні з'єднання, вони отримають 10 секунд на завершення роботи
     * перед примусовим розривом зв'язку.
     *
     * @async
     * @returns {Promise<void>}
     *
     * @example
     * // Використання при завершенні процесу Node.js
     * process.on('SIGTERM', async () => {
     *     console.log('SIGTERM signal received.');
     *     await db.close();
     *     process.exit(0);
     * });
     *
     * @description
     * Параметр `drainTime` у методі `pool.close(10)` дозволяє існуючим сесіям завершити свої операції.
     * Докладніше дивіться у документації [oracledb pool.close()](https://node-oracledb.readthedocs.io).
     */
    async close() {
        try {
            if (this.pool) {
                this.logger?.info?.('Closing Oracle Connection Pool...')
                // 10 секунд очікування (drain time) перед примусовим закриттям
                await this.pool.close(10)
                this.logger?.info?.('Oracle Pool closed safely.')
                this.pool = null // Очищуємо посилання для запобігання повторним спробам
            }
        } catch (error) {
            this.logger?.error?.('Error during pool shutdown', { error: error.message })
        }
    }
}
