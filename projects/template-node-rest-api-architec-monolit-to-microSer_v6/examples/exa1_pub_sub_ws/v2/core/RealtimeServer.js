import { Namespace } from './Namespace.js'
import { ILogger } from '../interfaces/ILogger.js'
import { WsAdapter } from '../adapters/WsAdapter.js'
import { ServiceFactory } from '../factories/ServiceFactory.js' // Імпортуємо фабрику

/**
 * @class RealtimeServer
 * @description Основний клас бібліотеки для управління просторами імен, кімнатами та WS-з'єднаннями.
 */
class RealtimeServer {
    #namespaces = new Map() // Map<namespaceId, Namespace>
    #logger
    #wsAdapter
    #serviceFactory // Додаємо фабрику

    /**
     * @param {ILogger} logger - Екземпляр логера, переданий через DI.
     * @param {object} wsOptions - Опції для WebSocket сервера (наприклад, port).
     * @param {ServiceFactory} serviceFactory - Фабрика для отримання Pub/Sub та Storage.
     */
    constructor(logger, wsOptions, serviceFactory) {
        if (!(logger instanceof ILogger)) {
            throw new Error('Logger must be an instance of ILogger.')
        }
        if (!(serviceFactory instanceof ServiceFactory)) {
            throw new Error('ServiceFactory must be an instance of ServiceFactory.')
        }
        this.#logger = logger
        this.#wsAdapter = new WsAdapter(wsOptions, this.#logger)
        this.#serviceFactory = serviceFactory // Присвоюємо фабрику
        this.#logger.log('RealtimeServer initialized.')
    }

    /**
     * Підключає всі необхідні сервіси (Storage, Pub/Sub).
     */
    async connect() {
        await this.#serviceFactory.connectAll()
        this.#logger.log('RealtimeServer connected all underlying services.')
    }

    /**
     * Створює або повертає існуючий простір імен.
     * @param {string} namespaceId - Унікальний ідентифікатор простору імен.
     * @param {object} [roomConfigDefaults={}] - Дефолтні конфігурації для кімнат в цьому просторі імен.
     * @returns {Namespace}
     */
    getOrCreateNamespace(namespaceId, roomConfigDefaults = {}) {
        if (!this.#namespaces.has(namespaceId)) {
            const namespace = new Namespace(
                namespaceId,
                this.#logger,
                roomConfigDefaults,
                this.#wsAdapter,
                this.#serviceFactory.getPubSub(), // Отримуємо Pub/Sub з фабрики
                this.#serviceFactory.getStorage(), // Отримуємо Storage з фабрики
                this.#serviceFactory.getLeaderElection(), // <<<<<<<< ТУТ МИ ТЕПЕР ПЕРЕДАЄМО LEADERELECTION
            )
            this.#namespaces.set(namespaceId, namespace)
            this.#logger.log(`Namespace '${namespaceId}' registered.`)

            // Реєстрація обробників WebSocket для цього простору імен
            this.#wsAdapter.registerNamespaceHandler(namespaceId, {
                onConnect: async (ws, userId) => {
                    this.#logger.debug(`User '${userId}' connected to namespace '${namespaceId}'.`)
                    // Можна сповістити простір імен про нове з'єднання, якщо це потрібно
                },
                onMessage: async (ws, userId, message) => {
                    this.#logger.debug(
                        `Message from user '${userId}' in namespace '${namespaceId}':`,
                        message,
                    )
                    await this.#handleIncomingMessage(namespaceId, userId, message, ws)
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

    /**
     * Приватний метод: обробляє вхідні повідомлення WebSocket.
     * @param {string} namespaceId - ID простору імен.
     * @param {string} userId - ID користувача.
     * @param {object} message - Вхідне повідомлення. Очікується формат: { type: "joinRoom", roomId: "...", payload: {...} }
     * @param {WebSocket} ws - WebSocket з'єднання.
     */
    async #handleIncomingMessage(namespaceId, userId, message, ws) {
        const namespace = this.#namespaces.get(namespaceId)
        if (!namespace) {
            this.#logger.warn(
                `Message for unknown namespace '${namespaceId}' from user '${userId}'.`,
            )
            return
        }

        switch (message.type) {
            case 'joinRoom':
                const roomToJoin = await namespace.getOrCreateRoom(message.roomId)
                const added = await roomToJoin.addUser(userId)
                if (added) {
                    // Повідомити клієнта, що він приєднався
                    this.#wsAdapter.sendMessageToUser(userId, {
                        type: 'roomJoined',
                        roomId: message.roomId,
                    })
                    // Використовуємо метод namespace для розсилки, щоб він міг використовувати Pub/Sub
                    await namespace.publishRoomMessage(message.roomId, userId, {
                        status: 'userJoined',
                        userId: userId,
                    })
                }
                break
            case 'leaveRoom':
                const roomToLeave = namespace.getRoom(message.roomId)
                if (roomToLeave) {
                    const removed = await roomToLeave.removeUser(userId)
                    if (removed) {
                        this.#wsAdapter.sendMessageToUser(userId, {
                            type: 'roomLeft',
                            roomId: message.roomId,
                        })
                        await namespace.publishRoomMessage(message.roomId, userId, {
                            status: 'userLeft',
                            userId: userId,
                        })
                    }
                }
                break
            case 'roomMessage':
                const targetRoom = namespace.getRoom(message.roomId)
                if (targetRoom && (await targetRoom.hasUser(userId))) {
                    // Використовуємо метод namespace для розсилки, щоб він міг використовувати Pub/Sub
                    await namespace.publishRoomMessage(message.roomId, userId, message.payload)
                } else {
                    this.#logger.warn(
                        `User '${userId}' tried to send message to non-existent or unauthorized room '${message.roomId}'.`,
                    )
                }
                break
            // Додайте інші типи повідомлень
            default:
                this.#logger.warn(
                    `Unknown message type '${message.type}' from user '${userId}' in namespace '${namespaceId}'.`,
                )
                break
        }
    }

    /**
     * Приватний метод: Видаляє користувача з усіх кімнат у заданому просторі імен.
     * Викликається при відключенні WebSocket.
     * @param {string} namespaceId - ID простору імен.
     * @param {string} userId - ID користувача.
     */
    async #removeUserFromAllRooms(namespaceId, userId) {
        const namespace = this.#namespaces.get(namespaceId)
        if (namespace) {
            // Отримуємо всі кімнати в цьому просторі імен
            const rooms = Array.from(namespace.getAllRooms().values()) // Доступ до приватного поля для ітерації
            for (const room of rooms) {
                if (await room.hasUser(userId)) {
                    await room.removeUser(userId)
                }
            }
        }
    }

    /**
     * Зупиняє всі простори імен, WebSocket сервер та сервіси.
     */
    async shutdown() {
        // Спочатку закриваємо WebSocket сервер, щоб не було нових з'єднань
        await this.#wsAdapter.close()

        // Потім дестроїмо всі простори імен
        const namespaceDestroyPromises = Array.from(this.#namespaces.values()).map((ns) =>
            ns.destroy(),
        )
        await Promise.all(namespaceDestroyPromises)
        this.#namespaces.clear()

        // Нарешті, закриваємо сервіси через фабрику
        await this.#serviceFactory.closeAll()
        this.#logger.log('RealtimeServer gracefully shut down.')
    }
}

export { RealtimeServer }
