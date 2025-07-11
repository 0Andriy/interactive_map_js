// src/core/RealtimeServer.js
import { Namespace } from './Namespace.js'
import { ILogger } from '../interfaces/ILogger.js'
import { WsAdapter } from '../adapters/WsAdapter.js'
import { ServiceFactory } from '../factories/ServiceFactory.js'

// Імпортуємо всі підкласи, які ми створили
import { ChatNamespace } from './namespaces/ChatNamespace.js'
import { GameNamespace } from './namespaces/GameNamespace.js'

class RealtimeServer {
    #namespaces = new Map()
    #logger
    #wsAdapter
    #serviceFactory
    // Мапа для визначення, який клас Namespace використовувати
    #namespaceClasses = {
        chat: ChatNamespace,
        game: GameNamespace,
        default: Namespace, // За замовчуванням, якщо для Namespace немає спеціального класу
    }

    constructor(logger, wsOptions, serviceFactory) {
        if (!(logger instanceof ILogger)) throw new Error('Logger must be an instance of ILogger.')
        if (!(serviceFactory instanceof ServiceFactory))
            throw new Error('ServiceFactory must be an instance of ServiceFactory.')

        this.#logger = logger
        this.#wsAdapter = new WsAdapter(wsOptions, this.#logger)
        this.#serviceFactory = serviceFactory
        this.#logger.log('RealtimeServer initialized.')
    }

    // ... (методи connect, #removeUserFromAllRooms, shutdown без змін)

    async getOrCreateNamespace(namespaceId, roomConfigDefaults = {}) {
        if (!this.#namespaces.has(namespaceId)) {
            // Вибираємо відповідний клас Namespace
            const NamespaceClass =
                this.#namespaceClasses[namespaceId] || this.#namespaceClasses.default

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
                    this.#logger.debug(
                        `User '${userId}' disconnected from namespace '${namespaceId}'.`,
                    )
                    await this.#removeUserFromAllRooms(namespaceId, userId)
                },
                onError: (ws, userId, error) => {
                    this.#logger.error(
                        `WebSocket error for user '${userId}' in namespace '${namespaceId}':`,
                        error,
                    )
                },
            })
        }
        return this.#namespaces.get(namespaceId)
    }
}

export { RealtimeServer }
