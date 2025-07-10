// src/WebSocketGateway.js
import { WebSocketServer } from 'ws'
import { Namespace } from './namespaces/index.js' // Імпортуємо Namespace напряму
import { Logger } from './logging/index.js'
import WebSocketClient from './WebSocketClient.js'

/**
 * @typedef {Map<string, Namespace>} NamespaceMap
 * @description Карта, де ключ - це URL-шлях (наприклад, '/chat'), а значення - екземпляр Namespace.
 */

/**
 * @class WebSocketGateway
 * @description Шлюз для взаємодії зовнішніх WebSocket-клієнтів з внутрішньою системою.
 * Розбиває простори імен за URL-шляхами.
 */
class WebSocketGateway {
    /**
     * @param {import('http').Server} server - HTTP-сервер, на якому буде працювати WebSocket.
     * @param {NamespaceMap} namespaces - Карта доступних просторів імен, прив'язаних до URL-шляхів (БЕЗ /ws/ префікса).
     * @param {object} logger - Екземпляр логера.
     */
    constructor(server, namespaces, logger) {
        if (!server) {
            throw new Error('HTTP server instance is required for WebSocketGateway.')
        }
        if (!(namespaces instanceof Map)) {
            throw new Error('Namespaces must be a Map<string, Namespace>.')
        }
        if (!logger || typeof logger.info !== 'function') {
            throw new Error('Logger instance is required for WebSocketGateway.')
        }

        this.wss = new WebSocketServer({ server })
        // Зберігаємо оригінальну карту просторів імен,
        // але для lookup будемо використовувати шляхи з префіксом /ws/
        this.baseNamespaces = namespaces
        this.logger = logger

        /**
         * @private
         * @type {Map<string, WebSocketClient>}
         * @description Зберігає інформацію про підключені WebSocket-клієнти за їх `id` підключення.
         */
        this.activeClients = new Map()

        this.wss.on('connection', this.handleConnection.bind(this))
        this.logger.info('WebSocket Gateway initialized. Listening for connections.')
    }

    /**
     * @private
     * @method handleConnection
     * @description Обробляє нове WebSocket-з'єднання.
     * @param {WebSocket} ws - Об'єкт WebSocket-з'єднання.
     * @param {import('http').IncomingMessage} req - Об'єкт вхідного HTTP-запиту, містить req.url.
     */
    handleConnection(ws, req) {
        const fullUrlPath = req.url || '/'
        // Видаляємо /ws/ префікс, щоб отримати базовий шлях для пошуку Namespace
        const namespacePath = fullUrlPath.startsWith('/ws') ? fullUrlPath.substring(3) : fullUrlPath // '/ws/chat' -> '/chat'

        const namespace = this.baseNamespaces.get(namespacePath)

        if (!namespace) {
            this.logger.warn(
                `WebSocket connection to unknown namespace URL: ${fullUrlPath}. Closing connection.`,
            )
            ws.close(1008, 'Unknown namespace path') // 1008 - Policy Violation
            return
        }

        const urlParams = new URLSearchParams(req.url.split('?')[1])
        const userId = urlParams.get('userId')
        const username = urlParams.get('username')

        // Передаємо логер для WebSocketClient
        const clientLogger = new Logger(`WSClient-${userId || 'Guest'}`, this.logger.logLevel)
        const client = new WebSocketClient(ws, clientLogger, null, userId, username)
        this.activeClients.set(client.id, client)

        this.logger.info(
            `New WebSocket client connected: ${client.id} (${client.username}/${client.userId}) to namespace '${fullUrlPath}' from ${req.socket.remoteAddress}`,
        )
        client.sendToClient({
            type: 'connected',
            clientId: client.id,
            userId: client.userId,
            username: client.username,
            namespace: namespace.name,
            message: `Welcome to ${namespace.name} namespace!`,
        })

        ws.on('message', (message) => this.handleMessage(client, message))
        ws.on('close', () => this.handleClose(client))
        ws.on('error', (error) => this.handleError(client, error))
    }

    /**
     * @private
     * @method handleMessage
     * @description Обробляє повідомлення від WebSocket-клієнта.
     * @param {WebSocketClient} client - Об'єкт WebSocketClient, що надіслав повідомлення.
     * @param {Buffer} message - Отримане повідомлення (Buffer).
     */
    async handleMessage(client, message) {
        const fullUrlPath = client.ws.url
        const namespacePath = fullUrlPath.startsWith('/ws') ? fullUrlPath.substring(3) : fullUrlPath
        const namespace = this.baseNamespaces.get(namespacePath)

        if (!namespace) {
            this.logger.warn(
                `Client ${client.id} sent message but connected to unknown namespace URL: ${fullUrlPath}.`,
            )
            client.sendToClient({
                type: 'error',
                message: `Unknown namespace path: ${fullUrlPath}`,
            })
            return
        }

        let parsedMessage
        try {
            parsedMessage = JSON.parse(message.toString())
            this.logger.debug(
                `Received message from ${client.id} (${client.username}) in ${namespace.name}:`,
                parsedMessage,
            )
        } catch (e) {
            this.logger.warn(
                `Invalid JSON from ${client.id} (${client.username}):`,
                message.toString(),
            )
            client.sendToClient({ type: 'error', message: 'Invalid JSON format.' })
            return
        }

        const { action, room: roomName, payload } = parsedMessage

        switch (action) {
            case 'join':
                if (!roomName) {
                    client.sendToClient({
                        type: 'error',
                        message: 'Room name is required to join.',
                    })
                    return
                }
                const roomToJoin = namespace.createRoom(roomName)

                // Колбек, який буде викликатися при отриманні повідомлень з кімнати.
                const roomCallback = (msg, senderId) => {
                    if (senderId !== client.userId) {
                        // Уникаємо ехо-повідомлень від самого себе
                        client.sendToClient({
                            type: 'room_message',
                            namespace: namespace.name,
                            room: roomName,
                            senderId: senderId,
                            data: msg,
                        })
                    }
                }

                try {
                    await client.joinRoom(roomToJoin, roomCallback)
                    client.sendToClient({
                        type: 'joined',
                        namespace: namespace.name,
                        room: roomName,
                        message: `Joined room ${roomName}.`,
                    })
                    // Повідомляємо інших у кімнаті про приєднання
                    await roomToJoin.publish(
                        {
                            type: 'status',
                            content: `${client.username} (${client.userId}) joined the room.`,
                        },
                        'system',
                    )
                } catch (error) {
                    this.logger.error(
                        `Failed to join room ${roomName} for ${client.id} (${client.username}):`,
                        error,
                    )
                    client.sendToClient({
                        type: 'error',
                        message: `Failed to join room ${roomName}`,
                    })
                }
                break

            case 'leave':
                if (!roomName) {
                    client.sendToClient({
                        type: 'error',
                        message: 'Room name is required to leave.',
                    })
                    return
                }
                const roomToLeave = namespace.getRoom(roomName)
                if (roomToLeave) {
                    try {
                        await client.leaveRoom(roomToLeave)
                        client.sendToClient({
                            type: 'left',
                            namespace: namespace.name,
                            room: roomName,
                            message: `Left room ${roomName}.`,
                        })
                        // Повідомляємо інших у кімнаті про вихід
                        await roomToLeave.publish(
                            {
                                type: 'status',
                                content: `${client.username} (${client.userId}) left the room.`,
                            },
                            'system',
                        )
                    } catch (error) {
                        this.logger.error(
                            `Failed to leave room ${roomName} for ${client.id} (${client.username}):`,
                            error,
                        )
                        client.sendToClient({
                            type: 'error',
                            message: `Failed to leave room ${roomName}`,
                        })
                    }
                } else {
                    client.sendToClient({
                        type: 'error',
                        message: `Room ${roomName} not found or not joined.`,
                    })
                }
                break

            case 'message':
                if (!roomName || !payload) {
                    client.sendToClient({
                        type: 'error',
                        message: 'Room name and payload are required to send a message.',
                    })
                    return
                }
                const targetRoom = namespace.getRoom(roomName)
                const roomIdentifier = `${namespace.name}/${roomName}`

                if (targetRoom && client.joinedRooms.has(roomIdentifier)) {
                    try {
                        await targetRoom.publish(payload, client.userId)
                        client.sendToClient({
                            type: 'message_sent',
                            namespace: namespace.name,
                            room: roomName,
                            data: payload,
                        })
                    } catch (error) {
                        this.logger.error(
                            `Failed to send message to room ${roomName} from ${client.id} (${client.username}):`,
                            error,
                        )
                        client.sendToClient({
                            type: 'error',
                            message: `Failed to send message to room ${roomName}`,
                        })
                    }
                } else {
                    client.sendToClient({
                        type: 'error',
                        message: `Not in room '${roomName}' or room not found in namespace '${namespace.name}'.`,
                    })
                }
                break

            default:
                client.sendToClient({ type: 'error', message: `Unknown action: ${action}` })
                break
        }
    }

    /**
     * @private
     * @method handleClose
     * @description Обробляє закриття WebSocket-з'єднання.
     * @param {WebSocketClient} client - Об'єкт WebSocketClient, що відключився.
     */
    async handleClose(client) {
        this.logger.info(
            `WebSocket client disconnected: ${client.id} (${client.username}/${client.userId})`,
        )
        await client.cleanup()
        this.activeClients.delete(client.id)
    }

    /**
     * @private
     * @method handleError
     * @description Обробляє помилки WebSocket-з'єднання.
     * @param {WebSocketClient} client - Об'єкт WebSocketClient, у якого виникла помилка.
     * @param {Error} error - Об'єкт помилки.
     */
    handleError(client, error) {
        this.logger.error(`WebSocket client ${client.id} (${client.username}) error:`, error)
        client.ws.close()
    }
}

export default WebSocketGateway
