// heartbeat.js

import { WebSocket } from 'ws' // Імпортуємо WebSocket для доступу до WebSocket.OPEN

/**
 * Налаштовує механізм Heartbeat (Ping/Pong) для WebSocketServer,
 * з розподіленим пінгуванням, щоб уникнути пікових навантажень.
 *
 * @param {import('ws').WebSocketServer} wssInstance - Екземпляр WebSocketServer.
 * @param {object} [options] - Об'єкт конфігурації.
 * @param {number} [options.pingInterval=30000] - Загальний інтервал (мс), протягом якого всі клієнти будуть пінговані.
 * @param {number} [options.pongTimeout=10000] - Максимальний час (мс) очікування понгу після пінгу.
 * @param {number} [options.checkDelayPerClient=10] - Затримка (мс) між надсиланням пінгів окремим клієнтам.
 * @param {object} logger - Об'єкт логера з методами debug, warn, error.
 * @param {Map<string, import('./Client.js').default>} allConnectedClients - Мапа всіх підключених ConnectedClient.
 */
export function setupHeartbeat(
    wssInstance,
    { pingInterval = 30 * 1000, pongTimeout = 10 * 1000, checkDelayPerClient = 10 } = {},
    logger,
    allConnectedClients, // Отримуємо мапу ConnectedClient
) {
    if (!logger || typeof logger.debug !== 'function') {
        throw new Error(
            'Logger instance with debug, warn, error methods is required for setupHeartbeat.',
        )
    }
    if (!(allConnectedClients instanceof Map)) {
        throw new Error(
            'allConnectedClients (Map of ConnectedClient instances) is required for setupHeartbeat.',
        )
    }

    // Примітка: Обробник 'connection' в wssInstance не потрібен тут напряму,
    // оскільки ConnectedClient вже має обробник 'pong' і ми оперуємо ConnectedClient.
    // Замість цього, Application.js буде передавати нам Map з ConnectedClient.

    let clientIterationIndex = 0 // Індекс поточного клієнта для пінгування
    let clientIterationTimer = null // Таймер для покрокової ітерації по клієнтах
    let heartbeatMainIntervalId = null // Додаємо ID для основного інтервалу, щоб можна було його очистити

    // Основний інтервал, який запускає новий цикл розподіленого пінгування всіх клієнтів.
    heartbeatMainIntervalId = setInterval(() => {
        // Тепер ми отримуємо клієнтів не через wssInstance.clients, а через allConnectedClients Map
        const clients = Array.from(allConnectedClients.values())

        if (clients.length === 0) {
            logger.debug('[Heartbeat] No clients connected, skipping ping cycle.')
            clientIterationIndex = 0 // Скидаємо індекс для наступного разу.
            return
        }

        // --- Блок попередження про конфігурацію ---
        const sweepDuration = clients.length * checkDelayPerClient
        if (sweepDuration > pingInterval && clients.length > 0) {
            logger.warn(
                `[Heartbeat Config Warning] Current sweep duration (${sweepDuration}ms for ${clients.length} clients @ ${checkDelayPerClient}ms/client) ` +
                    `is greater than pingInterval (${pingInterval}ms). ` +
                    `This means a new ping cycle starts before the previous one finishes, ` +
                    `potentially leading to some clients being pinged less reliably or less frequently than expected. ` +
                    `Consider adjusting 'pingInterval' or 'checkDelayPerClient'.`,
            )
        }
        // --- Кінець блоку попередження ---

        logger.debug(`[Heartbeat] Starting distributed ping cycle for ${clients.length} clients...`)

        // Очищаємо попередній інтервал покрокової перевірки, якщо він ще працює,
        // щоб уникнути накладання циклів і забезпечити своєчасний старт нового.
        if (clientIterationTimer) {
            clearInterval(clientIterationTimer)
        }

        clientIterationIndex = 0 // Скидаємо індекс на початок для нового циклу.

        // Запускаємо покрокову ітерацію по клієнтах
        clientIterationTimer = setInterval(() => {
            // Якщо всі клієнти в поточному списку були пінговані, зупиняємо цей покроковий інтервал.
            if (clientIterationIndex >= clients.length) {
                clearInterval(clientIterationTimer)
                logger.debug('[Heartbeat] Distributed ping cycle complete for this interval.')
                return
            }

            const client = clients[clientIterationIndex] // Це об'єкт ConnectedClient!

            // Важливо: перевірити, чи з'єднання все ще OPEN, оскільки воно могло закритись асинхронно.
            if (client && client.readyState === WebSocket.OPEN) {
                if (client.isAlive === false) {
                    // Якщо попередній PING не отримав PONG, і isAlive все ще false,
                    // це означає, що клієнт не відповів. Термінуємо з'єднання.
                    logger.warn(
                        `[Heartbeat] Client ${client.connectionId} did not respond to previous ping. Terminating connection.`,
                    )
                    client.terminate() // Використовуємо метод terminate з ConnectedClient
                } else {
                    // Позначаємо, що ми очікуємо PONG у відповідь на цей PING.
                    client.setAlive(false)

                    // Надсилаємо PING фрейм клієнту.
                    client.ping() // Використовуємо метод ping з ConnectedClient
                    logger.debug(`[Heartbeat] Sent ping to ${client.connectionId}.`)

                    // Встановлюємо індивідуальний таймер очікування PONG.
                    // Якщо PONG не прийде протягом 'pongTimeout', вважаємо з'єднання мертвим.
                    client.setPongTimer(
                        setTimeout(() => {
                            // Якщо таймер спрацював і isAlive все ще false, значить PONG не надійшов.
                            if (client.isAlive === false) {
                                logger.warn(
                                    `[Heartbeat] Client ${client.connectionId} failed to send pong within ${pongTimeout}ms. Terminating connection.`,
                                )
                                client.terminate() // Примусово закриваємо з'єднання.
                            }
                        }, pongTimeout),
                    )
                }
            } else if (client) {
                // Клієнт існує, але його WS не в стані OPEN
                logger.debug(
                    `[Heartbeat] Skipping ping for client ${client.connectionId} (readyState: ${client.readyState}).`,
                )
                // Якщо readyState не OPEN, можна вважати його неактивним і, можливо, видалити з мапи,
                // хоча це вже має відбуватися через обробник 'close' в ConnectedClient/Application.
            }

            clientIterationIndex++ // Переходимо до наступного клієнта.
        }, checkDelayPerClient) // Затримка між перевірками окремих клієнтів.
    }, pingInterval) // Основний інтервал, який запускає новий цикл пінгування всіх клієнтів.

    // Очищення всіх інтервалів при закритті сервера, щоб уникнути витоків пам'яті.
    wssInstance.on('close', function close() {
        clearInterval(heartbeatMainIntervalId) // Зупиняємо основний інтервал.
        if (clientIterationTimer) {
            clearInterval(clientIterationTimer) // Зупиняємо поточний покроковий інтервал.
        }
        // Додатково очищаємо всі індивідуальні таймери клієнтів, які могли залишитися активними.
        allConnectedClients.forEach((client) => {
            client.clearPongTimer() // Використовуємо метод ConnectedClient
        })
        logger.debug(
            '[Heartbeat] Server closed. All heartbeat intervals and client timers cleared.',
        )
    })
}
