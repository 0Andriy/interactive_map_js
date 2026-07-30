/**
 * Плагін для контролю життєдіяльності сокетів (Heartbeat / Ping-Pong).
 * Працює через індивідуальні таймери для уникання CPU spikes (DDOS-ефекту на Event Loop).
 */
export class HeartbeatPlugin {
    /**
     * @param {Object} server - Екземпляр вашого класу Server.
     * @param {Object} [opts={}] - Опції плагіна.
     * @param {number} [opts.pingInterval=30000] - Інтервал пінгування в мс.
     */
    constructor(server, opts = {}) {
        this.server = server
        this.pingInterval = opts.pingInterval || 30000

        // Карта для збереження таймерів сокетів, щоб не смітити всередині об'єкта Socket
        // Ключ — UUID сокета (handshake.id), значення — ID таймера setTimeout
        this._timers = new Map()

        this._init()
    }

    /**
     * Ініціалізація слухачів подій сервера.
     * @private
     */
    _init() {
        // Ми слухаємо подію 'connection' дефолтного простору імен.
        // Якщо у вашому сервері багато просторів імен, можна підписатися на кожен з них.
        this.server.on('connection', (socket) => {
            this._setupSocketHeartbeat(socket)
        })
    }

    /**
     * Налаштування персонального таймера для сокета.
     * @private
     * @param {Object} socket - Екземпляр класу Socket.
     */
    _setupSocketHeartbeat(socket) {
        const conn = socket.conn // Наш ConnWrapper

        // Рекурсивна функція циклу перевірки
        const heartbeatCycle = () => {
            this._timers.delete(socket.id)

            // Якщо з моменту минулого циклу клієнт не підтвердив свою присутність
            if (conn.isAlive === false) {
                console.log(`[HEARTBEAT PLUGIN] Сокет ${socket.id} замерз. Видалення.`)
                // Виклик розриву TCP-сесії. Це автоматично запустить ланцюжок відключення в Socket.js
                return conn.terminate()
            }

            // Скидаємо статус і відправляємо низькорівневий Ping фрейм
            conn.isAlive = false
            conn.ping()

            // Плануємо наступний тік через pingInterval мілісекунд
            const timerId = setTimeout(heartbeatCycle, this.pingInterval)
            this._timers.set(socket.id, timerId)
        }

        // Будь-яка активність клієнта (навіть бізнес-повідомлення) доводить, що він живий
        conn.on('message', () => {
            conn.isAlive = true
        })

        // Слухаємо відключення сокета для очищення пам'яті плагіна
        socket.on('disconnect', () => {
            const timerId = this._timers.get(socket.id)
            if (timerId) {
                clearTimeout(timerId)
                this._timers.delete(socket.id)
            }
        })

        // Перший запуск циклу для цього сокета
        const initialTimerId = setTimeout(heartbeatCycle, this.pingInterval)
        this._timers.set(socket.id, initialTimerId)
    }
}
