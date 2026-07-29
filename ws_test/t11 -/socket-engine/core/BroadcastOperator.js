/**
 * Клас для акумуляції прапорців фільтрації (кімнати, виключення) перед емітом або збором сокетів.
 */
export class BroadcastOperator {
    constructor(adapter, rooms = new Set(), except = new Set(), flags = {}) {
        this.adapter = adapter
        this.rooms = rooms
        this.except = except
        this.flags = flags
    }

    // Додає кімнату до цільової розсилки
    to(room) {
        const newRooms = new Set(this.rooms).add(room)
        return new BroadcastOperator(this.adapter, newRooms, this.except, this.flags)
    }

    // Виключає кімнату або конкретний socket.id з розсилки
    except(room) {
        const newExcept = new Set(this.except).add(room)
        return new BroadcastOperator(this.adapter, this.rooms, newExcept, this.flags)
    }

    // Встановлює прапорець локальної відправки (актуально для кластерів)
    get local() {
        const newFlags = { ...this.flags, local: true }
        return new BroadcastOperator(this.adapter, this.rooms, this.except, newFlags)
    }

    // Фінальна точка розсилки
    emit(event, ...args) {
        const packet = JSON.stringify({ event, args })
        this.adapter.broadcast(packet, {
            rooms: Array.from(this.rooms),
            except: Array.from(this.except),
            flags: this.flags,
        })
    }

    // Фінальна точка асинхронного збору сокетів за критеріями
    async fetchSockets() {
        return await this.adapter.fetchSockets({
            rooms: Array.from(this.rooms),
            except: Array.from(this.except),
            flags: this.flags,
        })
    }
}
