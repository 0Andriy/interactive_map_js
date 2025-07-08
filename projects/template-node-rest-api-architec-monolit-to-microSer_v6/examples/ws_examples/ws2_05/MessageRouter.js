// src/server/MessageRouter.js
// Примітки: ClientManager та EventManager передаються через конструктор,
// що є гарним прикладом Dependency Injection.

class MessageRouter {
    constructor(clientManager, eventManager) {
        this.clientManager = clientManager
        this.eventManager = eventManager
        this.handlers = new Map()
        this._registerDefaultHandlers()

        // Встановлюємо ClientManager для EventManager, щоб EventManager міг
        // отримувати доступ до клієнтів для розсилки
        this.eventManager.setClientManager(this.clientManager)

        this._setupInitialRoomTasks()
    }

    _registerDefaultHandlers() {
        // Аутентифікація (приклад, має бути більш надійною)
        this.registerHandler('authenticate', this._handleAuthenticate.bind(this))

        // Кімнати
        this.registerHandler('joinRoom', this._handleJoinRoom.bind(this))
        this.registerHandler('leaveRoom', this._handleLeaveRoom.bind(this))
        this.registerHandler('sendMessageToRoom', this._handleSendMessageToRoom.bind(this))

        // Простори імен
        this.registerHandler('addNamespace', this._handleAddNamespace.bind(this))
        this.registerHandler('removeNamespace', this._handleRemoveNamespace.bind(this))
        this.registerHandler('publishToNamespace', this._handlePublishToNamespace.bind(this))

        // Глобальні повідомлення
        this.registerHandler('broadcastGlobal', this._handleBroadcastGlobal.bind(this))

        // Керування задачами кімнати (можна використовувати для адміністрування)
        this.registerHandler('addTaskToRoom', this._handleAddTaskToRoom.bind(this))
        this.registerHandler('removeTaskFromRoom', this._handleRemoveTaskFromRoom.bind(this))
    }

    /**
     * Додає початкові задачі для кімнат при старті сервера.
     */
    _setupInitialRoomTasks() {
        // Отримуємо або створюємо кімнату "lobby"
        const lobbyRoom = this.clientManager._getOrCreateRoom('lobby')
        // Отримуємо або створюємо кімнату "game-alpha"
        const gameAlphaRoom = this.clientManager._getOrCreateRoom('game-alpha')

        // Задача для кімнати "lobby": надсилати "пульс" раз на 5 секунд
        lobbyRoom.addTask(
            'lobbyPulse',
            (roomContext) => {
                // Функція отримує об'єкт Room як контекст
                this.eventManager.publishToRoom(
                    roomContext.name,
                    { type: 'roomEvent', event: 'pulse', timestamp: new Date().toISOString() },
                    this.clientManager, // Завжди передаємо clientManager для розсилки
                )
            },
            5000, // 5 секунд
        )

        // Задача для ігрової кімнати "game-alpha": імітувати оновлення стану гри раз на 1 секунду
        gameAlphaRoom.addTask(
            'gameUpdate',
            (roomContext) => {
                const gameState = {
                    players: roomContext.activeUserCount,
                    status: 'playing',
                    gameId: roomContext.name,
                    // ... інший стан гри
                }
                this.eventManager.publishToRoom(
                    roomContext.name,
                    { type: 'gameStateUpdate', room: roomContext.name, state: gameState },
                    this.clientManager,
                )
            },
            1000, // 1 секунда
        )
        console.log('Initial room tasks set up.')
    }

    /**
     * Реєструє функцію-обробник для певного типу повідомлення.
     * @param {string} messageType - Тип повідомлення (наприклад, 'joinRoom').
     * @param {function(Client, object): void} handler - Функція-обробник.
     */
    registerHandler(messageType, handler) {
        this.handlers.set(messageType, handler)
    }

    /**
     * Маршрутизує вхідне повідомлення до відповідного обробника.
     * @param {Client} client - Клієнт, який відправив повідомлення.
     * @param {object} parsedMessage - Розпарсоване повідомлення.
     */
    route(client, parsedMessage) {
        const { type, payload } = parsedMessage
        const handler = this.handlers.get(type)

        if (handler) {
            // Для всіх повідомлень, окрім 'authenticate', перевіряємо, чи клієнт аутентифікований
            if (type !== 'authenticate' && !client.userData) {
                client.send({ type: 'error', payload: 'Authentication required.' })
                return
            }
            handler(client, payload)
        } else {
            console.warn(`No handler registered for message type: ${type} from client ${client.id}`)
            client.send({ type: 'error', payload: `Unknown message type: ${type}` })
        }
    }

    // --- Обробники повідомлень WebSocket ---

    // Приклад обробника аутентифікації
    _handleAuthenticate(client, payload) {
        const { token } = payload
        // У реальному додатку: валідація JWT токена, перевірка в базі даних тощо.
        if (token === 'my-secret-auth-token') {
            // Дуже простий приклад валідації
            client.userData = { userId: client.id, username: `User_${client.id.substring(0, 4)}` }
            client.send({
                type: 'authenticated',
                payload: { userId: client.userData.userId, username: client.userData.username },
            })
            console.log(`Client ${client.id} authenticated as ${client.userData.username}`)
        } else {
            client.send({ type: 'authFailed', payload: 'Invalid token.' })
            client.ws.close(1008, 'Authentication failed') // 1008: Policy Violation
        }
    }

    _handleJoinRoom(client, payload) {
        const { roomName } = payload
        if (!roomName) {
            client.send({ type: 'error', payload: 'Room name is required to join.' })
            return
        }
        // Отримуємо або створюємо об'єкт кімнати
        const room = this.clientManager._getOrCreateRoom(roomName)

        // Додаємо клієнта до кімнати
        client.joinRoom(roomName)
        room.incrementUserCount() // Збільшуємо лічильник користувачів у кімнаті

        this.eventManager.publishToRoom(
            roomName,
            {
                type: 'roomMessage',
                room: roomName,
                sender: 'system',
                message: `${client.userData.username} joined the room.`,
            },
            this.clientManager,
        )
        client.send({ type: 'roomJoined', payload: { roomName: roomName } })
        console.log(
            `${client.userData.username} joined room: ${roomName}. Current users in ${roomName}: ${room.activeUserCount}`,
        )
    }

    _handleLeaveRoom(client, payload) {
        const { roomName } = payload
        if (!roomName) {
            client.send({ type: 'error', payload: 'Room name is required to leave.' })
            return
        }

        if (client.isInRoom(roomName)) {
            client.leaveRoom(roomName)
            const room = this.clientManager.getRoom(roomName)
            if (room) {
                room.decrementUserCount() // Зменшуємо лічильник користувачів у кімнаті
                this.eventManager.publishToRoom(
                    roomName,
                    {
                        type: 'roomMessage',
                        room: roomName,
                        sender: 'system',
                        message: `${client.userData.username} left the room.`,
                    },
                    this.clientManager,
                    client.id, // Виключаємо того, хто виходить
                )
                console.log(
                    `${client.userData.username} left room: ${roomName}. Current users in ${roomName}: ${room.activeUserCount}`,
                )
            }
            client.send({ type: 'roomLeft', payload: { roomName: roomName } })
        } else {
            client.send({ type: 'error', payload: `Not in room: ${roomName}` })
        }
    }

    _handleSendMessageToRoom(client, payload) {
        const { roomName, message } = payload
        if (!roomName || !message) {
            client.send({ type: 'error', payload: 'Room name and message are required.' })
            return
        }

        if (client.isInRoom(roomName)) {
            this.eventManager.publishToRoom(
                roomName,
                {
                    type: 'roomMessage',
                    room: roomName,
                    sender: client.userData.username,
                    message: message,
                },
                this.clientManager,
                client.id, // Не відправляти самому собі, якщо це чат
            )
            console.log(`Message from ${client.userData.username} to room ${roomName}: ${message}`)
        } else {
            client.send({ type: 'error', payload: `Not in room: ${roomName} to send message.` })
        }
    }

    _handleAddNamespace(client, payload) {
        const { namespaceName } = payload
        if (!namespaceName) {
            client.send({ type: 'error', payload: 'Namespace name is required.' })
            return
        }
        client.addNamespace(namespaceName)
        client.send({ type: 'namespaceAdded', payload: { namespaceName: namespaceName } })
        console.log(`${client.userData.username} added to namespace ${namespaceName}`)
    }

    _handleRemoveNamespace(client, payload) {
        const { namespaceName } = payload
        if (!namespaceName) {
            client.send({ type: 'error', payload: 'Namespace name is required.' })
            return
        }
        client.removeNamespace(namespaceName)
        client.send({ type: 'namespaceRemoved', payload: { namespaceName: namespaceName } })
        console.log(`${client.userData.username} removed from namespace ${namespaceName}`)
    }

    _handlePublishToNamespace(client, payload) {
        const { namespaceName, message } = payload
        if (!namespaceName || !message) {
            client.send({ type: 'error', payload: 'Namespace and message are required.' })
            return
        }
        if (!client.isInNamespace(namespaceName)) {
            client.send({ type: 'error', payload: `You are not in namespace: ${namespaceName}` })
            return
        }

        this.eventManager.publishToNamespace(
            namespaceName,
            {
                type: 'namespaceMessage',
                namespace: namespaceName,
                sender: client.userData.username,
                message: message,
            },
            this.clientManager,
            client.id,
        )
        console.log(
            `Message from ${client.userData.username} to namespace ${namespaceName}: ${message}`,
        )
    }

    _handleBroadcastGlobal(client, payload) {
        const { message } = payload
        if (!message) {
            client.send({ type: 'error', payload: 'Message is required for global broadcast.' })
            return
        }
        this.eventManager.publishGlobally(
            { type: 'globalMessage', sender: client.userData.username, message: message },
            this.clientManager,
            client.id,
        )
        console.log(`Global broadcast from ${client.userData.username}: ${message}`)
    }

    _handleAddTaskToRoom(client, payload) {
        // Приклад адміністративної команди, перевірка прав має бути тут
        const { roomName, taskId, interval } = payload
        if (!roomName || !taskId || !interval || typeof interval !== 'number') {
            client.send({ type: 'error', payload: 'Room name, taskId, and interval are required.' })
            return
        }
        // Тут має бути логіка, яка визначає, яку функцію виконувати за taskId
        // У реальному додатку, ви б не передавали JS-функцію через WS-повідомлення.
        // Ви б мали попередньо визначені функції на сервері.
        const predefinedTaskFunction = (roomContext) => {
            this.eventManager.publishToRoom(
                roomContext.name,
                { type: 'roomTaskExecution', task: taskId, timestamp: new Date().toISOString() },
                this.clientManager,
            )
        }

        const room = this.clientManager._getOrCreateRoom(roomName)
        room.addTask(taskId, predefinedTaskFunction, interval)
        client.send({ type: 'taskAddedToRoom', payload: { roomName, taskId, interval } })
        console.log(`Task '${taskId}' added to room '${roomName}' by ${client.userData.username}`)
    }

    _handleRemoveTaskFromRoom(client, payload) {
        // Приклад адміністративної команди
        const { roomName, taskId } = payload
        if (!roomName || !taskId) {
            client.send({ type: 'error', payload: 'Room name and taskId are required.' })
            return
        }
        const room = this.clientManager.getRoom(roomName)
        if (room) {
            room.removeTask(taskId)
            client.send({ type: 'taskRemovedFromRoom', payload: { roomName, taskId } })
            console.log(
                `Task '${taskId}' removed from room '${roomName}' by ${client.userData.username}`,
            )
        } else {
            client.send({ type: 'error', payload: `Room '${roomName}' not found.` })
        }
    }
}

export default MessageRouter
