export class TrafficMonitor {
    static attach(socket, opts = {}) {
        // Слухаємо хук ініціалізації
        socket.on('_lifecycle:init', ({ timestamp }) => {
            console.log(
                `[Lifecycle: INIT] Створено об'єкт для IP: ${socket.handshake.address} в ${timestamp}`,
            )
        })

        // Слухаємо хук повної готовності
        socket.on('_lifecycle:connected', () => {
            console.log(
                `[Lifecycle: READY] Сокет ${socket.id} увійшов у власну кімнату та готовий до події connection`,
            )
        })

        // Слухаємо хук проходження пакетів
        socket.on('_lifecycle:packet', ({ packet }) => {
            console.log(`[Lifecycle: PACKET] Сокет ${socket.id} надіслав подію "${packet.event}"`)
        })

        // Перехоплюємо МИТЬ ВІДКЛЮЧЕННЯ (disconnecting)
        // Тут ми маємо повний доступ до кімнат, де сокет перебував
        socket.on('_lifecycle:disconnecting', ({ code, reason, activeRooms, timestamp }) => {
            console.log(`\n🛑 === АУДИТ ВІДКЛЮЧЕННЯ ===`)
            console.log(`Час: ${timestamp}`)
            console.log(`Сокет ID: ${socket.id}`)
            console.log(`Авторизований користувач:`, socket.user?.name || 'Гість')
            console.log(`Причина: ${reason} (Код WS: ${code})`)
            console.log(`Кімнати, де він перебував у цю мить:`, activeRooms)
            console.log(`Час знаходження в мережі: ${Date.now() - socket.connectedAt} мс`)
            console.log(`============================\n`)

            // Тут можна зробити фінальний запис у Базу Даних про вихід користувача з чату
        })

        // Фінальний хук очищення
        socket.on('_lifecycle:disconnected', () => {
            console.log(`[Lifecycle: CLEANED] Сокет ${socket.id} повністю видалено з адаптера.`)
        })
    }
}
