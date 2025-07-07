// // src/WebSocketServerManager.js
// import { WebSocketServer } from 'ws'
// import Namespace from './Namespace.js'

// class WebSocketServerManager {
//     constructor(port) {
//         this.wss = new WebSocketServer({ port })
//         this.namespaces = new Map() // Map<namespaceName, Namespace>

//         // Завжди створюємо дефолтний неймспейс '/'
//         this.of('/')

//         this.wss.on('connection', (ws, req) => this._handleConnection(ws, req))
//         this.wss.on('error', (error) => console.error('WebSocket Server Error:', error))

//         console.log(`WebSocket server started on port ${port}`)
//     }

//     /**
//      * Створює або повертає існуючий неймспейс.
//      * @param {string} name - Назва неймспейсу (наприклад, '/', '/admin').
//      * @returns {Namespace} - Об'єкт неймспейсу.
//      */
//     of(name) {
//         if (!this.namespaces.has(name)) {
//             const namespace = new Namespace(name)
//             this.namespaces.set(name, namespace)
//             // console.log(`Namespace '${name}' created.`);
//         }
//         return this.namespaces.get(name)
//     }

//     /**
//      * Обробляє нові вхідні WebSocket з'єднання.
//      * @param {WebSocket} ws - Об'єкт WebSocket.
//      * @param {IncomingMessage} req - Об'єкт HTTP-запиту, що ініціював з'єднання.
//      * @private
//      */
//     _handleConnection(ws, req) {
//         // Проста логіка для визначення неймспейсу з URL.
//         // У реальному застосунку може бути складніша логіка маршрутизації.
//         const url = req.url || '/'
//         const namespaceName = url.split('?')[0] // Видаляємо параметри запиту

//         const namespace = this.namespaces.get(namespaceName)

//         if (namespace) {
//             namespace.addSocket(ws)
//         } else {
//             // Якщо неймспейс не існує, закриваємо з'єднання або перенаправляємо до дефолтного
//             console.warn(`Connection to unknown namespace: ${namespaceName}. Closing connection.`)
//             ws.close(1000, 'Unknown namespace')
//         }
//     }

//     /**
//      * Закриває WebSocket сервер.
//      */
//     close() {
//         this.wss.close(() => {
//             console.log('WebSocket server closed.')
//         })
//     }
// }

// export default WebSocketServerManager

// src/WebSocketServerManager.js
import { WebSocketServer } from 'ws'
import Namespace from './Namespace.js'
// Імпортуємо Socket та Room, бо WebSocketServerManager тепер матиме частину їх функціоналу
import Socket from './Socket.js'
import Room from './Room.js'

class WebSocketServerManager {
    constructor(port) {
        this.wss = new WebSocketServer({ port })
        this.namespaces = new Map() // Map<namespaceName, Namespace>

        // Внутрішні колбеки для обробки 'connection' та 'disconnect' подій
        // Тепер вони належать самому менеджеру, як для дефолтного неймспейсу
        this._onConnectionCallbacks = new Set()
        this._onDisconnectCallbacks = new Set()

        // Сокети та кімнати, що належать дефолтному неймспейсу (тобто самому менеджеру)
        this.sockets = new Map() // Map<socketId, Socket> для дефолтного неймспейсу
        this.rooms = new Map() // Map<roomName, Room> для дефолтного неймспейсу

        this.wss.on('connection', (ws, req) => this._handleConnection(ws, req))
        this.wss.on('error', (error) => console.error('WebSocket Server Error:', error))

        console.log(`WebSocket server started on port ${port}`)
    }

    /**
     * Створює або повертає існуючий неймспейс.
     * Якщо назва '/', повертає сам об'єкт WebSocketServerManager.
     * @param {string} name - Назва неймспейсу (наприклад, '/', '/admin').
     * @returns {Namespace | WebSocketServerManager} - Об'єкт неймспейсу або сам менеджер.
     */
    of(name) {
        if (name === '/') {
            return this // Для '/' повертаємо сам об'єкт менеджера, який виступає як дефолтний
        }
        if (!this.namespaces.has(name)) {
            const namespace = new Namespace(name)
            this.namespaces.set(name, namespace)
        }
        return this.namespaces.get(name)
    }

    /**
     * Обробляє нові вхідні WebSocket з'єднання.
     * Якщо неймспейс не вказано в URL, або він не знайдений,
     * з'єднання перенаправляється до дефолтного неймспейсу '/'.
     * @param {WebSocket} ws - Об'єкт WebSocket.
     * @param {IncomingMessage} req - Об'єкт HTTP-запиту, що ініціював з'єднання.
     * @private
     */
    _handleConnection(ws, req) {
        let url = req.url || '/'
        const requestedNamespaceName = url.split('?')[0]

        let targetObject // Це буде або Namespace, або сам WebSocketServerManager

        if (requestedNamespaceName === '/') {
            targetObject = this // Це дефолтний неймспейс
        } else {
            targetObject = this.namespaces.get(requestedNamespaceName)
            if (!targetObject) {
                // Якщо запрошений неймспейс не існує, направляємо до дефолтного
                console.log(
                    `Connection to "${requestedNamespaceName}" not found. Routing to default namespace "/".`,
                )
                targetObject = this
            }
        }

        // Додаємо сокет до цільового об'єкта (Namespace або WebSocketServerManager)
        targetObject.addSocket(ws)
    }

    /**
     * Додає новий сокет до дефолтного неймспейсу (самого менеджера).
     * Цей метод викликається з _handleConnection.
     * @param {WebSocket} ws - Оригінальний WebSocket об'єкт.
     * @returns {Socket} - Створений об'єкт Socket.
     */
    addSocket(ws) {
        // Ми передаємо "this" як namespace, оскільки менеджер виступає як неймспейс
        const socket = new Socket(
            ws,
            this, // Namespace об'єкт для сокета
            (socketId) => this._handleSocketDisconnect(socketId), // Колбек для Socket дисконекту
            (socket, event, data) => this._handleSocketMessage(socket, event, data), // Колбек для Socket повідомлення
        )
        this.sockets.set(socket.id, socket)

        // Викликаємо всі зареєстровані обробники "connection" для дефолтного неймспейсу
        this._onConnectionCallbacks.forEach((callback) => callback(socket))

        return socket
    }

    /**
     * Внутрішній обробник відключення сокета для дефолтного неймспейсу.
     * @param {string} socketId - ID відключеного сокета.
     * @private
     */
    _handleSocketDisconnect(socketId) {
        const socket = this.sockets.get(socketId)
        if (socket) {
            this.sockets.delete(socketId)
            // Видаляємо сокет з усіх кімнат, до яких він належав
            socket.rooms.forEach((roomName) => {
                const room = this.rooms.get(roomName)
                if (room) {
                    room.removeSocket(socket)
                    if (room.sockets.size === 0) {
                        this.rooms.delete(roomName) // Видаляємо порожню кімнату
                    }
                }
            })
            // Викликаємо всі зареєстровані обробники "disconnect" для дефолтного неймспейсу
            this._onDisconnectCallbacks.forEach((callback) => callback(socket))
        }
    }

    /**
     * Внутрішній обробник повідомлень сокета для дефолтного неймспейсу.
     * Наразі просто передаємо, але можна додати централізовану логіку.
     * @private
     */
    _handleSocketMessage(socket, event, data) {
        // Залишаємо поки що порожнім, бо Socket сам обробляє свої зареєстровані події
    }

    /**
     * Реєструє обробник для події 'connection' або 'disconnect'
     * для дефолтного неймспейсу.
     * @param {string} event - Назва події ('connection' або 'disconnect').
     * @param {function} handler - Функція-обробник, яка отримує об'єкт Socket.
     */
    on(event, handler) {
        if (event === 'connection') {
            this._onConnectionCallbacks.add(handler)
        } else if (event === 'disconnect') {
            this._onDisconnectCallbacks.add(handler)
        } else {
            console.warn(
                `WebSocketServerManager.on(): Event "${event}" is not supported directly for the default namespace. Use socket.on() for custom events.`,
            )
        }
    }

    /**
     * Надсилає дані всім сокетам у дефолтному неймспейсі.
     * @param {string} event - Назва події.
     * @param {any} data - Дані для відправки.
     * @param {Set<string>} excludeSocketIds - ID сокетів, які потрібно виключити.
     */
    emit(event, data, excludeSocketIds = new Set()) {
        for (const socket of this.sockets.values()) {
            if (!excludeSocketIds.has(socket.id)) {
                socket.emit(event, data)
            }
        }
    }

    /**
     * Отримує об'єкт кімнати за назвою в дефолтному неймспейсі.
     * @param {string} roomName - Назва кімнати.
     * @returns {Room | undefined} - Об'єкт кімнати або undefined.
     */
    to(roomName) {
        if (!this.rooms.has(roomName)) {
            // За бажанням: автоматичне створення кімнати при першому зверненні
            // this.rooms.set(roomName, new Room(roomName));
            return undefined // Якщо не створюємо автоматично
        }
        return this.rooms.get(roomName)
    }

    /**
     * Додає сокет до конкретної кімнати в дефолтному неймспейсі.
     * @param {Socket} socket - Об'єкт сокета.
     * @param {string} roomName - Назва кімнати.
     */
    addSocketToRoom(socket, roomName) {
        if (!this.rooms.has(roomName)) {
            this.rooms.set(roomName, new Room(roomName))
        }
        const room = this.rooms.get(roomName)
        room.addSocket(socket)
    }

    /**
     * Видаляє сокет з конкретної кімнати в дефолтному неймспейсі.
     * @param {Socket} socket - Об'єкт сокета.
     * @param {string} roomName - Назва кімнати.
     */
    removeSocketFromRoom(socket, roomName) {
        const room = this.rooms.get(roomName)
        if (room) {
            room.removeSocket(socket)
            if (room.sockets.size === 0) {
                this.rooms.delete(roomName) // Видаляємо порожню кімнату
            }
        }
    }

    /**
     * Закриває WebSocket сервер.
     */
    close() {
        this.wss.close(() => {
            console.log('WebSocket server closed.')
        })
    }
}

export default WebSocketServerManager
