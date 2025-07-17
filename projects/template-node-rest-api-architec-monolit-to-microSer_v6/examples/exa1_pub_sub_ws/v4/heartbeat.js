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
 * @param {number} [options.checkDelayPerClient=50] - Затримка (мс) між надсиланням пінгів окремим клієнтам.
 * Чим більше клієнтів, тим меншим може бути цей параметр,
 * але не робіть його надто малим (<10мс) без потреби.
 * @param {object} logger - Об'єкт логера з методами debug, warn, error.
 */
export function setupHeartbeat(
    wssInstance,
    { pingInterval = 30 * 1000, pongTimeout = 10 * 1000, checkDelayPerClient = 10 } = {},
    logger, // Логер тепер обов'язковий і не має дефолту console
) {
    if (!logger || typeof logger.debug !== 'function') {
        throw new Error(
            'Logger instance with debug, warn, error methods is required for setupHeartbeat.',
        )
    }

    // Обробник нових з'єднань: ініціалізуємо стан для кожного клієнтського WebSocket.
    wssInstance.on('connection', function connection(clientWebSocket) {
        // ID вже має бути встановлений нашим ConnectedClient
        // clientWebSocket.id = `client_${Math.random().toString(36).substring(2, 9)}` // Видаляємо це, оскільки client.js вже генерує ID

        // Якщо ви використовуєте ConnectedClient, то ці властивості можна було б тримати там,
        // але для ping/pong бібліотека ws надає direct access до ws об'єкта,
        // тому зберігаємо їх на ньому.
        clientWebSocket.isAlive = true // Позначаємо клієнтський сокет як живий при підключенні
        clientWebSocket.pongTimer = null // Таймер для відстеження очікування PONG

        // Обробник PONG-повідомлень від клієнта.
        // При отриманні PONG, скидаємо позначку isAlive і очищаємо таймер очікування.
        clientWebSocket.on('pong', () => {
            clientWebSocket.isAlive = true
            clearTimeout(clientWebSocket.pongTimer)
            logger.debug(`[Heartbeat] Received pong from ${clientWebSocket.id}. Connection active.`)
        })

        // Обробники закриття та помилок з'єднання: очищаємо ресурси.
        // Це критично для запобігання витоків пам'яті.
        clientWebSocket.on('close', () => {
            clearTimeout(clientWebSocket.pongTimer)
            logger.debug(
                `[Heartbeat] Connection ${clientWebSocket.id} closed. Cleaned up pong timer.`,
            )
        })

        clientWebSocket.on('error', (err) => {
            clearTimeout(clientWebSocket.pongTimer)
            logger.error(`[Heartbeat] Error on connection ${clientWebSocket.id}:`, err)
        })
    })

    let clientIterationIndex = 0 // Індекс поточного клієнта для пінгування
    let clientIterationTimer = null // Таймер для покрокової ітерації по клієнтах
    let heartbeatMainIntervalId = null // Додаємо ID для основного інтервалу, щоб можна було його очистити

    // Основний інтервал, який запускає новий цикл розподіленого пінгування всіх клієнтів.
    heartbeatMainIntervalId = setInterval(() => {
        const clients = Array.from(wssInstance.clients) // Отримуємо поточний список клієнтських WebSocket.

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

            const clientWebSocket = clients[clientIterationIndex]

            // Важливо: перевірити, чи з'єднання все ще OPEN, оскільки воно могло закритись асинхронно.
            if (clientWebSocket && clientWebSocket.readyState === WebSocket.OPEN) {
                if (clientWebSocket.isAlive === false) {
                    // Якщо попередній PING не отримав PONG, і isAlive все ще false,
                    // це означає, що клієнт не відповів. Термінуємо з'єднання.
                    logger.warn(
                        `[Heartbeat] Client ${clientWebSocket.id} did not respond to previous ping. Terminating connection.`,
                    )
                    clientWebSocket.terminate()
                } else {
                    // Позначаємо, що ми очікуємо PONG у відповідь на цей PING.
                    clientWebSocket.isAlive = false

                    // Надсилаємо PING фрейм клієнту.
                    clientWebSocket.ping()
                    logger.debug(`[Heartbeat] Sent ping to ${clientWebSocket.id}.`)

                    // Встановлюємо індивідуальний таймер очікування PONG.
                    // Якщо PONG не прийде протягом 'pongTimeout', вважаємо з'єднання мертвим.
                    clearTimeout(clientWebSocket.pongTimer) // Очищаємо попередній таймер, якщо є.
                    clientWebSocket.pongTimer = setTimeout(() => {
                        // Якщо таймер спрацював і isAlive все ще false, значить PONG не надійшов.
                        if (clientWebSocket.isAlive === false) {
                            logger.warn(
                                `[Heartbeat] Client ${clientWebSocket.id} failed to send pong within ${pongTimeout}ms. Terminating connection.`,
                            )
                            clientWebSocket.terminate() // Примусово закриваємо з'єднання.
                        }
                    }, pongTimeout)
                }
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
        wssInstance.clients.forEach((clientWebSocket) => {
            if (clientWebSocket.pongTimer) {
                clearTimeout(clientWebSocket.pongTimer)
            }
        })
        logger.debug(
            '[Heartbeat] Server closed. All heartbeat intervals and client timers cleared.',
        )
    })
}
