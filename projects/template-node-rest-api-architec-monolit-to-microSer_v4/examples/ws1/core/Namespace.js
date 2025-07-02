// core/Namespace.js
import { EventEmitter } from '../utils/EventEmitter.js'
import { Socket } from './Socket.js'
import { RoomManager } from './RoomManager.js'
import { MessageProtocol } from '../utils/MessageProtocol.js'

export class Namespace extends EventEmitter {
    constructor(path, serverManager) {
        super()
        this.path = path
        this.serverManager = serverManager
        this.sockets = new Map() // Map<socketId, Socket>
        this.roomManager = new RoomManager() // Менеджер кімнат для цього простору імен

        console.log(`Namespace created: ${this.path}`)
    }

    // Метод для додавання нового сокета до цього простору імен
    addSocket(ws) {
        const socket = new Socket(ws, this, this.serverManager)
        this.sockets.set(socket.id, socket)
        console.log(`Socket ${socket.id} connected to namespace ${this.path}`)
        this.emit('connection', socket) // Випускаємо подію 'connection' для користувача
        return socket
    }

    // Метод для видалення сокета
    removeSocket(socket) {
        if (this.sockets.has(socket.id)) {
            this.sockets.delete(socket.id)
            // Видалити сокет з усіх кімнат, до яких він належав
            for (const roomName of socket.rooms) {
                this.roomManager.removeSocketFromRoom(roomName, socket)
            }
            console.log(`Socket ${socket.id} removed from namespace ${this.path}`)
        }
    }

    // Метод для розсилки подій усім сокетам у цьому просторі імен
    emit(event, data, isBinary = false) {
        // Додаємо isBinary
        const message = MessageProtocol.serialize(event, data, this.path, null, isBinary)
        for (const socket of this.sockets.values()) {
            socket.ws.send(message)
        }
        // Якщо є адаптер для масштабування, також розіслати через нього
        if (this.serverManager.adapter) {
            // Передаємо isBinary у адаптер
            this.serverManager.adapter.publish({
                type: 'namespace_broadcast',
                namespace: this.path,
                event,
                data,
                isBinary, // Важливо передати
            })
        }
    }

    // Метод для розсилки подій усім сокетам у кімнаті
    to(roomName) {
        const roomSockets = this.roomManager.getSocketsInRoom(roomName)
        return {
            emit: (event, data, isBinary = false) => {
                // Додаємо isBinary
                const message = MessageProtocol.serialize(
                    event,
                    data,
                    this.path,
                    roomName,
                    isBinary,
                )
                for (const socket of roomSockets) {
                    if (socket.ws.readyState === socket.ws.OPEN) {
                        socket.ws.send(message)
                    }
                }
                // Якщо є адаптер для масштабування, також розіслати через нього
                if (this.serverManager.adapter) {
                    this.serverManager.adapter.publish({
                        type: 'room_broadcast',
                        namespace: this.path,
                        room: roomName,
                        event,
                        data,
                        isBinary, // Важливо передати
                    })
                }
            },
        }
    }

    // Метод для розсилки подій усім, крім одного сокета
    emitToOthersInNamespace(senderSocket, event, data, isBinary = false) {
        // Додаємо isBinary
        const message = MessageProtocol.serialize(event, data, this.path, null, isBinary)
        for (const socket of this.sockets.values()) {
            if (socket !== senderSocket && socket.ws.readyState === socket.ws.OPEN) {
                socket.ws.send(message)
            }
        }
        if (this.serverManager.adapter) {
            this.serverManager.adapter.publish({
                type: 'namespace_broadcast_except',
                namespace: this.path,
                exceptId: senderSocket.id,
                event,
                data,
                isBinary, // Важливо передати
            })
        }
    }

    // Обробка подій, які надходять від сокета в цьому просторі імен
    handleSocketEvent(socket, event, data) {
        // Тут можна додати логіку для обробки подій,
        // які можуть бути перехоплені на рівні простору імен
        // Наприклад, для перенаправлення подій у кімнати
        if (event === 'join room') {
            socket.join(data)
        } else if (event === 'leave room') {
            socket.leave(data)
        } else {
            // За замовчуванням, якщо подія не обробляється тут,
            // ми можемо припустити, що це може бути повідомлення для розсилки
            // або якась інша специфічна подія для цього простору імен
            // Наприклад:
            // this.emit(event, data); // Розсилати всім у просторі імен
        }
    }
}
