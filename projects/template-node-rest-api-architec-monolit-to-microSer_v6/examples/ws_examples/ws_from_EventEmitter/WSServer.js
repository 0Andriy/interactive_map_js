// src/WSServer.js

import { WebSocketServer } from 'ws'
import { parse } from 'url'
import Namespace from './Namespace.js'
import Client from './Client.js'
import { EventEmitter } from 'events'
import { logger } from './utils/logger.js'
import { verifyToken } from './utils/auth.js'

class WSServer extends EventEmitter {
    constructor(options = {}) {
        super()
        this.wss = new WebSocketServer(options)
        this.namespaces = new Map()

        // Кореневий простір імен за замовчуванням не вимагає автентифікації
        // Якщо токен надано, він буде оброблений, інакше клієнт буде гостем.
        this.rootNamespace = this.of('/')
        this.logger = logger

        this._setupListeners()
        this.logger.info('WebSocket Server initialized.')
    }

    _setupListeners() {
        this.wss.on('connection', (ws, request) => this._handleConnection(ws, request))
        this.wss.on('error', (error) => this._handleServerError(error))
        this.wss.on('listening', () => this.emit('listening'))
        this.wss.on('close', () => this.emit('close'))
    }

    async _handleConnection(ws, request) {
        // Зроблено асинхронним для підтримки асинхронних стратегій
        const url = parse(request.url, true)
        const token = url.query.token // Видобуваємо токен з URL-параметрів

        let requestedPath =
            url.pathname === '/' || !url.pathname ? '/' : url.pathname.replace(/\/$/, '')

        // Отримуємо або створюємо простір імен для цього шляху.
        // Опції для нового NS будуть оброблені в wsServer.of()
        let namespace = this.namespaces.get(requestedPath)
        if (!namespace) {
            // Якщо простір імен не знайдено, перенаправляємо до кореневого.
            // Можна закрити з'єднання, якщо ви не дозволяєте неіснуючі простори імен.
            this.logger.warn(
                `No specific namespace found for path '${requestedPath}'. Defaulting to root '/'.`,
            )
            requestedPath = '/'
            namespace = this.rootNamespace // Використовуємо попередньо збережене посилання на кореневий NS
        }

        const authOptions = namespace.getAuthOptions() // Отримуємо опції автентифікації для цього NS

        let authenticatedUser = null
        if (authOptions.authRequired) {
            // Якщо автентифікація потрібна, застосовуємо стратегію або дефолтний JWT
            const strategy = authOptions.authStrategy || this.#defaultJwtAuthStrategy
            try {
                authenticatedUser = await strategy(token, ws, request)
            } catch (error) {
                this.logger.error(
                    `Authentication strategy error for '${requestedPath}': ${error.message}`,
                    error,
                )
                ws.close(1011, 'Authentication strategy error') // Внутрішня помилка
                return
            }

            if (!authenticatedUser) {
                this.logger.warn(
                    `Client tried to connect to '${requestedPath}' without valid authentication. Closing connection.`,
                )
                ws.close(1008, 'Unauthorized: Authentication required or invalid credentials')
                return
            }
        } else {
            // Якщо автентифікація не потрібна, дозволяємо підключення як гостю,
            // але якщо токен все ж є, можна його обробити
            if (token) {
                authenticatedUser = verifyToken(token) // Може бути гостем з токеном
                if (authenticatedUser) {
                    this.logger.debug(
                        `Client connected to '${requestedPath}' (auth not required) with valid token for user: ${authenticatedUser.userId}`,
                    )
                } else {
                    this.logger.debug(
                        `Client connected to '${requestedPath}' (auth not required) with invalid token.`,
                    )
                }
            } else {
                this.logger.debug(
                    `Client connected to '${requestedPath}' (auth not required) as guest.`,
                )
            }
            // Якщо автентифікація не потрібна, але користувач не автентифікований, призначаємо його як "Гостя"
            authenticatedUser = authenticatedUser || { userId: 'Guest', roles: ['guest'] }
        }

        const client = new Client(ws, request)
        client.user = authenticatedUser // Зберігаємо дані користувача в об'єкті клієнта

        // Логіка авторизації, якщо є (наприклад, для ролей)
        // Приклад: Тільки користувачі з роллю 'admin' можуть підключатися до /admin
        if (
            requestedPath === '/admin' &&
            (!client.user.roles || !client.user.roles.includes('admin'))
        ) {
            this.logger.warn(
                `Client ${client.id} (User: ${client.user.userId}) tried to connect to /admin without admin role. Closing connection.`,
            )
            ws.close(1008, 'Unauthorized: Insufficient permissions for this namespace')
            return
        }

        namespace.addClient(client)

        // Якщо клієнт підключився до кореневого простору (явно або за замовчуванням),
        // емітуємо подію 'connection' на самому WSServer.
        // Це робить wsServer.on('connection') синонімом rootNamespace.on('connection').
        if (namespace === this.rootNamespace) {
            this.emit('connection', client)
        }
    }

    /**
     * Дефолтна стратегія автентифікації за JWT-токеном.
     * Використовується, якщо authRequired: true, але authStrategy не вказано.
     * @param {string | undefined} token
     * @returns {object | null}
     * @private
     */
    #defaultJwtAuthStrategy(token) {
        if (!token) {
            logger.warn('Default JWT strategy: Token missing.')
            return null
        }
        return verifyToken(token)
    }

    _handleServerError(error) {
        this.logger.error('WebSocket Server error:', error)
        this.emit('error', error)
    }

    /**
     * Отримує або створює простір імен за вказаним шляхом з опціями.
     * @param {string} path - Шлях простору імен.
     * @param {import('./Namespace.js').NamespaceOptions} [options={}] - Опції для простору імен.
     * @returns {Namespace}
     */
    of(path, options = {}) {
        // Тепер приймає options
        const normalizedPath = path === '/' ? '/' : path.replace(/\/$/, '')
        if (!this.namespaces.has(normalizedPath)) {
            // Передаємо опції до конструктора Namespace
            const namespace = new Namespace(normalizedPath, options)
            this.namespaces.set(normalizedPath, namespace)
            return namespace
        }
        return this.namespaces.get(normalizedPath)
    }

    /**
     * Закриває WebSocket сервер.
     * @returns {Promise<void>}
     */
    close() {
        return new Promise((resolve, reject) => {
            this.wss.close((err) => {
                if (err) {
                    return reject(err)
                }
                this.logger.info('WebSocket Server closed.')
                resolve()
            })
        })
    }

    /**
     * Повертає список всіх підключених клієнтів (по всіх просторах імен).
     * Це демонстраційний метод, в реальному застосуванні краще працювати через Namespace.
     * @returns {Array<Client>}
     */
    getAllClients() {
        const allClients = []
        this.namespaces.forEach((ns) => {
            ns.clients.forEach((client) => allClients.push(client))
        })
        return allClients
    }
}

export default WSServer
