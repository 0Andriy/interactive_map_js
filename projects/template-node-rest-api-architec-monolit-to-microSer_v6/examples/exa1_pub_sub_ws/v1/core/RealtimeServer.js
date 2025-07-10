import { Namespace } from './Namespace.js'
import { ILogger } from '../interfaces/ILogger.js'
import { WsAdapter } from '../adapters/WsAdapter.js'

/**
 * @class RealtimeServer
 * @description Основний клас бібліотеки для управління просторами імен, кімнатами та WS-з'єднаннями.
 */
class RealtimeServer {
    #namespaces = new Map() // Map<namespaceId, Namespace>
    #logger
    #wsAdapter

    /**
     * @param {ILogger} logger - Екземпляр логера, переданий через DI.
     * @param {object} [wsOptions={ port: 8080 }] - Опції для WebSocket сервера.
     */
    constructor(logger, wsOptions = { port: 8080 }) {
        if (!(logger instanceof ILogger)) {
            throw new Error('Logger must be an instance of ILogger.')
        }
        this.#logger = logger
        this.#wsAdapter = new WsAdapter(wsOptions, this.#logger)
        this.#logger.log('RealtimeServer initialized.')
    }

    /**
     * Створює або повертає існуючий простір імен.
     * @param {string} namespaceId - Унікальний ідентифікатор простору імен.
     * @param {object} [roomConfigDefaults={}] - Дефолтні конфігурації для кімнат в цьому просторі імен.
     * @returns {Namespace}
     */
    getOrCreateNamespace(namespaceId, roomConfigDefaults = {}) {
        if (!this.#namespaces.has(namespaceId)) {
            const namespace = new Namespace(namespaceId, this.#logger, roomConfigDefaults)
            this.#namespaces.set(namespaceId, namespace)
            this.#logger.log(`Namespace '${namespaceId}' registered.`)

            // Реєстрація обробників WebSocket для цього простору імен
            this.#wsAdapter.registerNamespaceHandler(namespaceId, {
                onConnect: (ws, userId) => {
                    this.#logger.debug(`User '${userId}' connected to namespace '${namespaceId}'.`)
                    // Оповістити про простір імен про нове з'єднання, якщо необхідно
                },
                onMessage: (ws, userId, message) => {
                    this.#logger.debug(
                        `Message from user '${userId}' in namespace '${namespaceId}':`,
                        message,
                    )
                    // Обробка вхідних повідомлень: маршрутизація до кімнат
                    this.#handleIncomingMessage(namespaceId, userId, message, ws)
                },
                onDisconnect: (ws, userId) => {
                    this.#logger.debug(
                        `User '${userId}' disconnected from namespace '${namespaceId}'.`,
                    )
                    // Видалити користувача з усіх кімнат у цьому просторі імен
                    this.#removeUserFromAllRooms(namespaceId, userId)
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
    #handleIncomingMessage(namespaceId, userId, message, ws) {
        const namespace = this.#namespaces.get(namespaceId)
        if (!namespace) {
            this.#logger.warn(
                `Message for unknown namespace '${namespaceId}' from user '${userId}'.`,
            )
            return
        }

        switch (message.type) {
            case 'joinRoom':
                const roomToJoin = namespace.getOrCreateRoom(message.roomId)
                roomToJoin.addUser(userId)
                // Повідомити клієнта, що він приєднався
                this.#wsAdapter.sendMessageToUser(userId, {
                    type: 'roomJoined',
                    roomId: message.roomId,
                })
                // Приклад: розіслати всім у кімнаті про нового учасника
                this.#wsAdapter.broadcastToUsers(roomToJoin.getUsers(), {
                    type: 'userJoinedRoom',
                    roomId: message.roomId,
                    userId: userId,
                })
                break
            case 'leaveRoom':
                const roomToLeave = namespace.getRoom(message.roomId)
                if (roomToLeave) {
                    roomToLeave.removeUser(userId)
                    this.#wsAdapter.sendMessageToUser(userId, {
                        type: 'roomLeft',
                        roomId: message.roomId,
                    })
                    // Приклад: розіслати всім у кімнаті, що учасник покинув її
                    this.#wsAdapter.broadcastToUsers(roomToLeave.getUsers(), {
                        type: 'userLeftRoom',
                        roomId: message.roomId,
                        userId: userId,
                    })
                }
                break
            case 'roomMessage':
                const targetRoom = namespace.getRoom(message.roomId)
                if (targetRoom && targetRoom.hasUser(userId)) {
                    // Приклад: розіслати повідомлення всім у кімнаті, крім відправника
                    const otherUsers = targetRoom.getUsers().filter((id) => id !== userId)
                    this.#wsAdapter.broadcastToUsers(otherUsers, {
                        type: 'roomData',
                        roomId: message.roomId,
                        from: userId,
                        payload: message.payload,
                    })
                } else {
                    this.#logger.warn(
                        `User '${userId}' tried to send message to non-existent or unauthorized room '${message.roomId}'.`,
                    )
                }
                break
            // Додайте інші типи повідомлень (наприклад, 'startGame', 'movePlayer')
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
    #removeUserFromAllRooms(namespaceId, userId) {
        const namespace = this.#namespaces.get(namespaceId)
        if (namespace) {
            // Ітеруємося по всіх кімнатах і видаляємо користувача
            namespace.#rooms.forEach((room) => {
                if (room.hasUser(userId)) {
                    room.removeUser(userId)
                    // Якщо кімната стала порожньою і налаштована на видалення, вона сама сповістить Namespace
                }
            })
        }
    }

    /**
     * Зупиняє всі простори імен та WebSocket сервер.
     */
    async shutdown() {
        this.#namespaces.forEach((ns) => ns.destroy())
        this.#namespaces.clear()
        await this.#wsAdapter.close()
        this.#logger.log('RealtimeServer gracefully shut down.')
    }
}

export { RealtimeServer }
