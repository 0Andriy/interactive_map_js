import RoomManager from './RoomManager.js'

// --- Приклад використання ---
// Створюємо простий об'єкт-логер для демонстрації
// Створюємо простий об'єкт-логер для демонстрації
const myLogger = {
    info: (...args) => console.log('[INFO]', ...args),
    debug: (...args) => console.log('[DEBUG]', ...args),
    warn: (...args) => console.warn('[WARN]', ...args),
    error: (...args) => console.error('[ERROR]', ...args),
}

// Імітуємо WebSocket клієнтів, додавши метод 'on'
class MockWebSocket {
    constructor(id) {
        this.id = id
        this.readyState = 1 // 1 = OPEN
        this.messages = []
        this._eventListeners = new Map() // Для зберігання обробників подій
    }

    async send(message) {
        // Імітуємо невелику затримку мережі
        await new Promise((resolve) => setTimeout(resolve, 1)) // 5 мс затримки

        // В цьому mock-клієнті ми просто логуємо повідомлення
        const logMessage =
            Buffer.isBuffer(message) || message instanceof ArrayBuffer
                ? `[Binary Data, ${message.byteLength || message.length} bytes]`
                : String(message).substring(0, 50) +
                  (typeof message === 'string' && message.length > 50 ? '...' : '')

        myLogger.debug(`MockClient ${this.id} отримав: ${logMessage}`)
        this.messages.push(message) // Зберігаємо отримане повідомлення
    }

    // *** ДОДАНО: Метод 'on' для імітації Event Emitter ***
    on(event, listener) {
        if (!this._eventListeners.has(event)) {
            this._eventListeners.set(event, new Set())
        }
        this._eventListeners.get(event).add(listener)
    }

    // *** ДОДАНО: Метод 'off' для очищення слухачів (хороша практика) ***
    off(event, listener) {
        if (this._eventListeners.has(event)) {
            this._eventListeners.get(event).delete(listener)
            if (this._eventListeners.get(event).size === 0) {
                this._eventListeners.delete(event)
            }
        }
    }

    // *** ДОДАНО: Метод 'emit' для програмного виклику подій ***
    emit(event, ...args) {
        if (this._eventListeners.has(event)) {
            this._eventListeners.get(event).forEach((listener) => {
                listener(...args)
            })
        }
    }

    close() {
        this.readyState = 3 // 3 = CLOSED
        // Викликаємо обробники події 'close'
        this.emit('close')
        myLogger.info(`MockClient ${this.id} закрив з'єднання.`)
        // Очищаємо всі слухачі після закриття
        this._eventListeners.clear()
    }
}

// --- Демонстрація функціоналу ---
const roomManager = new RoomManager(myLogger)

myLogger.info('\n--- Створення кімнат ---')
// Кімната для текстових оновлень
roomManager.createRoom(
    'chat_room',
    async (roomName, clients) => {
        myLogger.info(`Збираємо дані для кімнати ${roomName}. Клієнтів: ${clients.size}`)
        return {
            type: 'chat_update',
            message: `Привіт від сервера! ${new Date().toLocaleTimeString()}`,
            clients: clients.size,
        }
    },
    1500, // Оновлення кожні 1.5 секунди
    true,
)

// Кімната для бінарних оновлень (наприклад, дані з сенсора, або частини файлу)
roomManager.createRoom(
    'binary_data_stream',
    async (roomName, clients) => {
        myLogger.info(`Генеруємо бінарні дані для ${roomName}...`)
        // Створюємо випадкові бінарні дані
        const buffer = Buffer.alloc(16) // 16 байт
        for (let i = 0; i < buffer.length; i++) {
            buffer[i] = Math.floor(Math.random() * 256)
        }
        return buffer // Повертаємо Buffer
    },
    2500, // Оновлення кожні 2.5 секунди
    true,
)

myLogger.info('\n--- Приєднання клієнтів ---')
const client1 = new MockWebSocket('client_001')
const client2 = new MockWebSocket('client_002')
const client3 = new MockWebSocket('client_003')
const client4 = new MockWebSocket('client_004')
const client5 = new MockWebSocket('client_005')

roomManager.joinRoom('chat_room', client1)
roomManager.joinRoom('binary_data_stream', client2)
roomManager.joinRoom('chat_room', client3) // client3 також приєднується до чату
roomManager.joinRoom('chat_room', client4)
roomManager.joinRoom('binary_data_stream', client4)
roomManager.joinRoom('chat_room', client5)
roomManager.joinRoom('binary_data_stream', client5)

myLogger.info(`Кількість клієнтів у 'chat_room': ${roomManager.getClientCount('chat_room')}`)
myLogger.info(
    `Кількість клієнтів у 'binary_data_stream': ${roomManager.getClientCount(
        'binary_data_stream',
    )}`,
)

myLogger.info('\n--- Надсилання ручних повідомлень ---')
// Надсилаємо текстове повідомлення
roomManager.sendMessageToRoom('chat_room', {
    type: 'system_message',
    content: 'Ласкаво просимо до чату!',
})

// Надсилаємо бінарне повідомлення (наприклад, невеликий пакет даних)
const binaryCommand = Buffer.from([0x01, 0x02, 0x03, 0x04])
roomManager.sendMessageToRoom('binary_data_stream', binaryCommand)

myLogger.info('\n--- Зачекаємо, щоб побачити оновлення інтервалів ---')

// Завершуємо демонстрацію через 8 секунд
setTimeout(() => {
    myLogger.info('\n--- Завершення демонстрації ---')
    client1.close()
    client2.close()
    client3.close()
    client4.close()
    client5.close()

    // Додаткова затримка для перевірки, чи кімнати видаляються після закриття останнього клієнта
    setTimeout(() => {
        myLogger.info(
            `Кількість клієнтів у 'chat_room' після закриття: ${roomManager.getClientCount(
                'chat_room',
            )}`,
        )
        myLogger.info(
            `Кількість клієнтів у 'binary_data_stream' після закриття: ${roomManager.getClientCount(
                'binary_data_stream',
            )}`,
        )
        myLogger.info('Активні кімнати:', Array.from(roomManager.rooms.keys()))
    }, 1000)
}, 8000)
