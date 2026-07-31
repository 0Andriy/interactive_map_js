// custom-socket.io/BroadcastOperator.js
export class BroadcastOperator {
    constructor(adapter, rooms = new Set(), except = new Set()) {
        this.adapter = adapter
        this.rooms = rooms
        this.except = except
    }

    // Дозволяє додавати кімнати ланцюжком: .to('room1').to('room2')
    to(room) {
        const newRooms = new Set(this.rooms).add(room)
        return new BroadcastOperator(this.adapter, newRooms, this.except)
    }

    in(room) {
        return this.to(room)
    }

    // Виключити конкретний сокет із розсилки (наприклад, самого себе для .broadcast)
    exceptSocket(socketId) {
        const newExcept = new Set(this.except).add(socketId)
        return new BroadcastOperator(this.adapter, this.rooms, newExcept)
    }

    // Фінальний виклику ланцюжка
    emit(eventName, ...args) {
        const packet = { type: 'event', name: eventName, args }
        // Делегуємо чисту розсилку адаптеру
        this.adapter.broadcast(packet, {
            rooms: this.rooms,
            except: this.except,
        })
        return true
    }
}
