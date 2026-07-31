export class Namespace {
    /**
     * @param {object} dependencies - Об'єкт із впровадженими залежностями (DI)
     * @param {string} dependencies.name - Назва простору імен (наприклад, '/chat')
     * @param {object} dependencies.bus - Впроваджена шина подій (EventBus) для цього namespace
     * @param {object} dependencies.adapter - Впроваджений інстанс адаптера (Adapter)
     * @param {Function} dependencies.broadcastFactory - Фабрика для створення BroadcastOperator для глобальних розсилок
     */
    constructor({ name, bus, adapter, broadcastFactory }) {
        this.name = String(name)
        this.sockets = new Map() // socketId -> Socket

        // --- ВПРОВАДЖЕНІ ЗАЛЕЖНОСТІ (DI) ---
        this.bus = bus
        this.adapter = adapter
        this.broadcastFactory = broadcastFactory

        // Ініціалізуємо глобальний оператор розсилки для всього простору імен.
        // Оскільки це розсилка від імені сервера, початковий except порожній (передаємо null/порожній Set).
        this.broadcast = this.broadcastFactory(null)
    }

    // --- ПРОКСІ-МЕТОДИ ДЛЯ ГЛОБАЛЬНИХ РОЗСИЛОК НА РІВНІ NAMESPACE ---
    // Тепер nsp.to('room').emit() створює оператор динамічно через впроваджену фабрику

    to(room) {
        return this.broadcast.to(room)
    }
    in(room) {
        return this.to(room)
    }
    except(roomOrSocketId) {
        return this.broadcast.except(roomOrSocketId)
    }
    get volatile() {
        return this.broadcast.volatile
    }
    get local() {
        return this.broadcast.local
    }
    timeout(ms) {
        return this.broadcast.timeout(ms)
    }

    /**
     * Глобальна розсилка усім підключеним клієнтам простору імен
     */
    emit(event, ...args) {
        return this.broadcast.emit(event, ...args)
    }

    /**
     * Інтеграція нового сокета у пул простору імен
     */
    async add(socket) {
        this.sockets.set(socket.id, socket)

        // Повідомляємо адаптер про ініціалізацію базової кімнати сокета
        if (typeof this.adapter.addAll === 'function') {
            await this.adapter.addAll(socket.id, new Set([socket.id]))
        }

        // Тригеримо бізнес-подію підключення для розробників
        this.bus.emit('connection', socket)
    }

    /**
     * Безпечне видалення сокета з пулу (виклик під час disconnect)
     */
    remove(socket) {
        if (this.sockets.has(socket.id)) {
            this.sockets.delete(socket.id)

            if (typeof this.adapter.delAll === 'function') {
                this.adapter.delAll(socket.id)
            }
        }
    }
}
