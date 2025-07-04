import { WebSocket } from 'ws' // Для перевірки WebSocket.OPEN

class NamespaceManager {
    constructor(logger, roomsManager) {
        this.logger = logger
        this.roomsManager = roomsManager // Отримуємо екземпляр RoomsManager
        this.registeredNamespaces = []
    }

    /**
     * Створює регулярний вираз з шаблону шляху та витягує імена параметрів.
     * Приклад: "/game/:id/chat" -> /^\/game\/([^\/]+)\/chat\/?$/
     * @param {string} pathPattern - Шаблон шляху з параметрами, наприклад "/game/:id"
     * @returns {{regex: RegExp, paramNames: string[]}}
     */
    _pathToRegex(pathPattern) {
        const paramNames = []
        const regexString = pathPattern.replace(/:([a-zA-Z0-9_]+)/g, (match, paramName) => {
            paramNames.push(paramName)
            return '([^/]+)' // Замінюємо :param на групу захоплення для будь-якого сегменту
        })
        // Додаємо /? на кінець, щоб дозволити або не дозволити кінцевий слеш
        // Додаємо ^ і $ для повного співпадіння шляху
        return { regex: new RegExp(`^${regexString}\/?$`), paramNames }
    }

    /**
     * Реєструє обробник для конкретного простору імен, використовуючи шаблон шляху.
     * @param {string} pathPattern - Шаблон шляху, наприклад "/game/:id" або "/admin".
     * @param {object} handler - Об'єкт обробника з методами handleConnection, handleMessage, handleClose, getUpdateCallback, getUpdateInterval, getRunInitialUpdate.
     * @param {string} [roomPrefix] - Префікс для формування ключа кімнати (наприклад, 'game', 'chat'). Якщо не вказано, використовується перший сегмент шляху.
     */
    registerNamespace(pathPattern, handler, roomPrefix = null) {
        const { regex, paramNames } = this._pathToRegex(pathPattern)

        if (!roomPrefix) {
            const firstSegmentMatch = pathPattern.match(/^\/?([a-zA-Z0-9_]+)/)
            if (firstSegmentMatch) {
                roomPrefix = firstSegmentMatch[1]
            } else {
                roomPrefix = 'default'
            }
        }

        this.registeredNamespaces.push({
            pathPattern,
            regex,
            paramNames,
            handler,
            roomPrefix,
        })
        this.logger.info(`Registered namespace: '${pathPattern}' with regex: ${regex}`)
    }

    /**
     * Обробляє нове WebSocket з'єднання.
     * @param {CustomWebSocket} ws - Екземпляр WebSocket з розширеними властивостями.
     * @returns {boolean} True, якщо з'єднання оброблено, false, якщо шлях не відповідає.
     */
    handleConnection(ws) {
        const { path: requestPath, id: clientId, username } = ws
        let matchedNamespace = null
        let params = {}

        for (const ns of this.registeredNamespaces) {
            const match = requestPath.match(ns.regex)
            if (match) {
                matchedNamespace = ns
                ns.paramNames.forEach((name, index) => {
                    params[name] = match[index + 1]
                })
                break
            }
        }

        if (!matchedNamespace) {
            this.logger.warn(
                `No registered namespace found for path: ${requestPath}. Closing connection for ${
                    username || clientId
                }.`,
            )
            ws.close(1000, 'Unknown namespace')
            return false
        }

        let roomKey = matchedNamespace.roomPrefix
        if (matchedNamespace.paramNames.length > 0) {
            roomKey += '_' + matchedNamespace.paramNames.map((name) => params[name]).join('_')
        } else {
            roomKey = matchedNamespace.roomPrefix
        }

        // --- Ключова зміна: Використовуємо RoomsManager для приєднання до кімнати ---
        const updateCallback = matchedNamespace.handler.getUpdateCallback
            ? matchedNamespace.handler.getUpdateCallback(params)
            : async (roomName, clients) => null // Default to no update

        const updateIntervalMs = matchedNamespace.handler.getUpdateInterval
            ? matchedNamespace.handler.getUpdateInterval(params)
            : 0 // Default to no interval

        const runInitialUpdate = matchedNamespace.handler.getRunInitialUpdate
            ? matchedNamespace.handler.getRunInitialUpdate(params)
            : false // Default to no initial update

        const roomJoined = this.roomsManager.joinRoom(
            roomKey,
            ws,
            updateCallback,
            updateIntervalMs,
            runInitialUpdate,
        )

        if (!roomJoined) {
            this.logger.error(
                `Failed to join client ${clientId} to room ${roomKey}. Closing connection.`,
            )
            ws.close(1000, 'Failed to join room')
            return false
        }

        ws._namespace = matchedNamespace.pathPattern
        ws._roomKey = roomKey
        ws._params = params

        this.logger.info(
            `Client ${username} (${clientId}) connected to '${requestPath}'. Mapped to namespace '${
                matchedNamespace.pathPattern
            }'. Assigned to room: ${roomKey}. Params: ${JSON.stringify(params)}`,
        )

        matchedNamespace.handler.handleConnection(ws, params)

        ws.on('message', (message) => {
            matchedNamespace.handler.handleMessage(ws, message, params)
        })

        // Обробник 'close' буде викликаний RoomsManager'ом, який потім викличе removeClientGlobally
        // Але ми також можемо викликати handleClose обробника неймспейсу, щоб він мав свою логіку очищення.
        ws.on('close', (code, reason) => {
            this.logger.debug(
                `Client ${username} (${clientId}) closing. Calling namespace handler's handleClose.`,
            )
            matchedNamespace.handler.handleClose(ws, params)
            // RoomsManager.removeClientGlobally вже буде викликаний завдяки реєстрації в joinRoom
        })

        ws.on('error', (error) => {
            this.logger.error(`WebSocket error for ${username} on ${requestPath}:`, error)
        })

        return true
    }
}

export default NamespaceManager

// --- Приклад обробників неймспейсів ---
// Кожен обробник отримує namespaceManager (щоб мати доступ до roomsManager)

export const gameNamespaceHandler = (namespaceManager) => ({
    handleConnection: (ws, params) => {
        const { id: clientId, username } = ws
        const { id: gameId } = params
        ws.send(JSON.stringify({ type: 'gameInfo', message: `Welcome to game "${gameId}"!` }))

        // Використовуємо roomsManager для розсилки
        namespaceManager.roomsManager.sendMessageToRoom(
            ws._roomKey,
            JSON.stringify({ type: 'playerJoined', player: clientId }),
        )
    },
    handleMessage: (ws, message, params) => {
        const { id: gameId } = params
        try {
            const msg = JSON.parse(message)
            if (msg.type === 'move') {
                namespaceManager.logger.info(
                    `[Game Room ${gameId}] Move from ${ws.id}: ${JSON.stringify(msg.payload)}`,
                )
                namespaceManager.roomsManager.sendMessageToRoom(
                    ws._roomKey,
                    JSON.stringify({ type: 'playerMove', playerId: ws.id, move: msg.payload }),
                )
            }
        } catch (e) {
            namespaceManager.logger.error(`Failed to parse game message from ${ws.id}:`, e)
        }
    },
    handleClose: (ws, params) => {
        namespaceManager.logger.debug(`Game client ${ws.id} cleanup for ${params.id}.`)
        // Повідомляємо інших гравців про вихід
        namespaceManager.roomsManager.sendMessageToRoom(
            ws._roomKey,
            JSON.stringify({ type: 'playerLeft', player: ws.id }),
        )
    },

    // Методи для RoomsManager
    getUpdateCallback: (params) => {
        const { id: gameId } = params
        return async (roomName, clients) => {
            // У реальному застосунку: отримати актуальний стан гри за gameId
            // Наприклад: const gameState = await fetchGameStateFromDB(gameId);
            return {
                type: 'gameUpdate',
                gameId: gameId,
                players: Array.from(clients).map((c) => ({ id: c.id, username: c.username })),
                timestamp: Date.now(),
            }
        }
    },
    getUpdateInterval: (params) => 5000, // Оновлювати стан гри кожні 5 секунд
    getRunInitialUpdate: (params) => true, // Запустити оновлення одразу при підключенні першого гравця
})

export const chatNamespaceHandler = (namespaceManager) => ({
    handleConnection: (ws, params) => {
        const { username } = ws
        const { id: gameId } = params
        ws.send(
            JSON.stringify({ type: 'chatInfo', message: `Welcome to chat for game "${gameId}"!` }),
        )
        namespaceManager.roomsManager.sendMessageToRoom(
            ws._roomKey,
            JSON.stringify({
                type: 'chatMessage',
                sender: 'SERVER',
                message: `${username} has joined the chat.`,
            }),
        )
    },
    handleMessage: (ws, message, params) => {
        const { id: gameId } = params
        try {
            const msg = JSON.parse(message)
            if (msg.type === 'sendMessage') {
                namespaceManager.logger.info(
                    `[Game Chat ${gameId}] Message from ${ws.id}: ${msg.payload}`,
                )
                namespaceManager.roomsManager.sendMessageToRoom(
                    ws._roomKey,
                    JSON.stringify({
                        type: 'chatMessage',
                        sender: ws.username || ws.id,
                        message: msg.payload,
                    }),
                )
            }
        } catch (e) {
            namespaceManager.logger.error(`Failed to parse chat message from ${ws.id}:`, e)
        }
    },
    handleClose: (ws, params) => {
        namespaceManager.logger.debug(`Chat client ${ws.id} cleanup for ${params.id}.`)
        namespaceManager.roomsManager.sendMessageToRoom(
            ws._roomKey,
            JSON.stringify({
                type: 'chatMessage',
                sender: 'SERVER',
                message: `${ws.username} has left the chat.`,
            }),
        )
    },
    // Чат може не потребувати періодичних оновлень
    getUpdateCallback: (params) => async (roomName, clients) => null,
    getUpdateInterval: (params) => 0,
    getRunInitialUpdate: (params) => false,
})

export const defaultNamespaceHandler = (namespaceManager) => ({
    handleConnection: (ws, params) => {
        ws.send(JSON.stringify({ type: 'info', message: `Hello from default namespace!` }))
    },
    handleMessage: (ws, message, params) => {
        namespaceManager.logger.info(`[Default Namespace] Message from ${ws.id}: ${message}`)
        // Ехо-відповідь для дефолтного неймспейсу
        ws.send(JSON.stringify({ type: 'response', message: `Echo: ${message}` }))
    },
    handleClose: (ws, params) => {
        namespaceManager.logger.debug(`Default client ${ws.id} cleanup.`)
    },
    getUpdateCallback: (params) => async (roomName, clients) => null,
    getUpdateInterval: (params) => 0,
    getRunInitialUpdate: (params) => false,
})
