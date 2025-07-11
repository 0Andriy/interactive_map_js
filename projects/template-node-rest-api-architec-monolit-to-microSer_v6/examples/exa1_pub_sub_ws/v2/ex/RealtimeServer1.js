// src/core/RealtimeServer.js
import { Namespace } from './Namespace.js'
import { ILogger } from '../interfaces/ILogger.js'
import { WsAdapter } from '../adapters/WsAdapter.js'
import { ServiceFactory } from '../factories/ServiceFactory.js'

// Імпортуємо підкласи Namespace
import { ChatNamespace } from './namespaces/ChatNamespace.js'
import { GameNamespace } from './namespaces/GameNamespace.js'

class RealtimeServer {
    #namespaces = new Map()
    #logger
    #wsAdapter
    #serviceFactory
    #namespaceClasses = {
        chat: ChatNamespace,
        game: GameNamespace,
        default: Namespace,
    }
    #authConfig = {
        chat: { requiresAuth: true },
        game: { requiresAuth: true },
        public: { requiresAuth: false }, // Наприклад, публічний namespace без автентифікації
    }

    constructor(logger, wsOptions, serviceFactory) {
        if (!(logger instanceof ILogger)) throw new Error('Logger must be an instance of ILogger.')
        if (!(serviceFactory instanceof ServiceFactory))
            throw new Error('ServiceFactory must be an instance of ServiceFactory.')

        this.#logger = logger
        this.#serviceFactory = serviceFactory
        // WsAdapter тепер створюється без Ws-сервера, а з опцією noServer: true
        this.#wsAdapter = new WsAdapter({ noServer: true, ...wsOptions }, this.#logger)
        this.#logger.log('RealtimeServer initialized.')
    }

    async connect() {
        await this.#serviceFactory.connectAll()
        this.#logger.log('RealtimeServer connected all underlying services.')
    }

    /**
     * "Підключає" Realtime-сервер до існуючого HTTP-сервера.
     * @param {http.Server} httpServer - Екземпляр HTTP-сервера.
     */
    listen(httpServer) {
        httpServer.on('upgrade', (request, socket, head) => {
            const parsedUrl = new URL(request.url, `http://${request.headers.host}`)
            const pathSegments = parsedUrl.pathname.split('/').filter(Boolean) // ['ws', 'chat']

            if (pathSegments[0] !== 'ws') {
                socket.destroy()
                return
            }

            const namespaceId = pathSegments[1]
            const namespaceConfig = this.#authConfig[namespaceId]

            if (!namespaceConfig) {
                this.#logger.warn(`Upgrade request to unknown namespace '${namespaceId}'.`)
                socket.destroy()
                return
            }

            // Перевірка автентифікації
            if (namespaceConfig.requiresAuth) {
                // Логіка отримання та валідації токена
                const token =
                    parsedUrl.searchParams.get('token') ||
                    request.headers['authorization']?.split(' ')[1]
                if (!token) {
                    this.#logger.warn(
                        `Authentication failed: Token missing for namespace '${namespaceId}'.`,
                    )
                    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
                    socket.destroy()
                    return
                }

                try {
                    // Валідація токена. В реальному проєкті це буде функція з jwt.verify()
                    const payload = this.#validateToken(token)
                    this.#logger.debug(
                        `User '${payload.userId}' authenticated for namespace '${namespaceId}'.`,
                    )

                    // Продовжуємо "рукостискання" WebSocket, передаючи ID користувача
                    this.#wsAdapter.handleUpgrade(
                        request,
                        socket,
                        head,
                        namespaceId,
                        payload.userId,
                    )
                } catch (error) {
                    this.#logger.warn(
                        `Authentication failed: Invalid token for namespace '${namespaceId}'. Error: ${error.message}`,
                    )
                    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
                    socket.destroy()
                    return
                }
            } else {
                // Для публічних namespace, автентифікація не потрібна
                const userId = 'guest_' + Math.random().toString(36).substring(7)
                this.#logger.debug(
                    `Allowing guest user to connect to public namespace '${namespaceId}'.`,
                )
                this.#wsAdapter.handleUpgrade(request, socket, head, namespaceId, userId)
            }
        })
    }

    // Приблизна логіка для валідації токена (в реальному житті, це буде jwt.verify)
    #validateToken(token) {
        // Симуляція валідації
        if (token === 'valid_token_123') {
            return { userId: 'test_user_456', roles: ['user'] }
        }
        throw new Error('Invalid token')
    }

    async getOrCreateNamespace(namespaceId, roomConfigDefaults = {}) {
        // ... (метод без змін)
        const NamespaceClass = this.#namespaceClasses[namespaceId] || this.#namespaceClasses.default
        const namespace = new NamespaceClass(
            namespaceId,
            this.#logger,
            roomConfigDefaults,
            this.#wsAdapter,
            this.#serviceFactory.getPubSub(),
            this.#serviceFactory.getStorage(),
            this.#serviceFactory.getLeaderElection(),
        )
        this.#namespaces.set(namespaceId, namespace)
        this.#logger.log(
            `Namespace '${namespaceId}' registered using class ${NamespaceClass.name}.`,
        )

        // ... (реєстрація обробників)
        this.#wsAdapter.registerNamespaceHandler(namespaceId, {
            onConnect: async (ws, userId) => {
                this.#logger.debug(`User '${userId}' connected to namespace '${namespaceId}'.`)
            },
            onMessage: async (ws, userId, message) => {
                this.#logger.debug(
                    `Message from user '${userId}' in namespace '${namespaceId}':`,
                    message,
                )
                await namespace.handleClientMessage(userId, message, ws)
            },
            onDisconnect: async (ws, userId) => {
                this.#logger.debug(`User '${userId}' disconnected from namespace '${namespaceId}'.`)
                await this.#removeUserFromAllRooms(namespaceId, userId)
            },
            onError: (ws, userId, error) => {
                this.#logger.error(
                    `WebSocket error for user '${userId}' in namespace '${namespaceId}':`,
                    error,
                )
            },
        })

        return this.#namespaces.get(namespaceId)
    }
}

export { RealtimeServer }
