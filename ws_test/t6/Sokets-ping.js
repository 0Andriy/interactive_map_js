class SocketConnection {
    constructor(id, rawWs, serverOptions) {
        this.id = id
        this.rawWs = rawWs

        // Налаштування з опцій сервера
        this.pingIntervalMs = serverOptions.pingIntervalMs || 25000
        this.pingTimeoutMs = serverOptions.pingTimeoutMs || 20000

        this.pingTimeoutTimer = null
        this.pingIntervalTimer = null

        this.initHeartbeat()
    }

    initHeartbeat() {
        // Запускаємо перший цикл очікування
        this.resetPingInterval()

        // Нативний pong від браузера
        this.rawWs.on('pong', () => {
            this.handlePong()
        })

        // На випадок кастомного JSON повідомлення
        this.rawWs.on('message', (data) => {
            // Будь-яка активність від клієнта — це теж ознака життя,
            // але Socket.io зазвичай скидає таймери суто по нативному pong.
            // За бажанням тут теж можна викликати handlePong();
        })
    }

    resetPingInterval() {
        // Очищаємо старий інтервал, якщо він був
        clearTimeout(this.pingIntervalTimer)

        // Крок 1: Чекаємо індивідуальні 25 секунд спокою
        this.pingIntervalTimer = setTimeout(() => {
            this.sendPing()
        }, this.pingIntervalMs)
    }

    sendPing() {
        if (this.rawWs.readyState !== 1) return this.terminate()

        // Відправляємо легкий пінг пакет
        this.rawWs.ping()

        // Крок 2: ОДРАЗУ запускаємо лічильник таймауту на 20 секунд
        this.pingTimeoutTimer = setTimeout(() => {
            // Якщо цей код виконався — клієнт не вклався у 20 секунд!
            this.terminate()
        }, this.pingTimeoutMs)
    }

    handlePong() {
        // Клієнт встиг відповісти! Скасовуємо смертельний вирок (таймаут)
        clearTimeout(this.pingTimeoutTimer)

        // Повертаємося до Кроку 1: чекаємо наступні 25 секунд до нового пінгу
        this.resetPingInterval()
    }

    terminate() {
        clearTimeout(this.pingIntervalTimer)
        clearTimeout(this.pingTimeoutTimer)

        try {
            this.rawWs.terminate() // Миттєве жорстке закриття сокета
        } catch (e) {}

        // Емітимо подію наверх, щоб сервер видалив цей сокет зі своєї Map
        this.emit('close')
    }
}
