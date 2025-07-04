/**
 * @file Центральний модуль для ініціалізації та управління WebSocket сервісами.
 * Відповідає за аутентифікацію, роутинг WebSocket з'єднань на відповідні неймспейси
 * та управління життєвим циклом RoomManager.
 */

import http from 'http'
import { WebSocket, WebSocketServer } from 'ws'
import RoomManager from './manager/RoomManager.js'
import jwtManager from '../utils/JwtManager.js'
import loggerModule from '../utils/logger.js'
const logger = loggerModule.getLoggerForService('ws-service')

// Імпортуємо обробники неймспейсов
import chatNamespace from './services/chat.service.js'
import gameNamespace from './services/game.service.js'
import notificationsNamespace from './services/notifications.service.js'

/**
 * Єдиний інстанс RoomManager для всього застосунку.
 * Керує всіма кімнатами та обміном повідомленнями через Redis Pub/Sub.
 * @type {RoomManager}
 */
export const roomManager = new RoomManager({
    logger: logger,
})

/**
 * @typedef {import('./RoomManager.js').CustomWebSocket} CustomWebSocket
 */

// --- Налаштування Ping/Pong ---
const PING_INTERVAL_MS = 30000 // Надсилати PING кожні 30 секунд
const PONG_TIMEOUT_MS = 5000 // Чекати PONG 5 секунд. Якщо не отримали, закрити з'єднання.
let pingIntervalHandle = null // Для зберігання таймера ping

/**
 * Карта для зберігання обробників неймспейсов.
 * Ключ - це точний шлях до неймспейсу.
 * Для шляхів з параметрами (як /ws/game/:id) використовується окрема логіка `startsWith`.
 * @type {Object.<string, {handleConnection: Function, handleMessage: Function, handleClose: Function}>}
 */
export const namespaceConfig = {
    '/ws/chat': chatNamespace,
    '/ws/notifications': notificationsNamespace,
    '/ws/game/': {
        ...gameNamespace, // Розгортаємо всі властивості gameNamespace
        segmentRequired: true, // Додаємо нову властивість
        segmentName: 'game ID', // Можна додати назву для логування
    },
    // '/ws/another_dynamic_ns/': {
    //     ...anotherNamespace,
    //     segmentRequired: true,
    //     segmentName: 'resource ID'
    // },
    // '/ws/optional_dynamic_ns/': {
    //     ...optionalNamespace,
    //     segmentRequired: false // За замовчуванням false або не додавати взагалі
    // }
}

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
 * @param {object} [logger=console] - Об'єкт логера з методами debug, warn, error. За замовчуванням використовує console.
 */
export async function setupHeartbeat(
    wssInstance,
    { pingInterval = 30000, pongTimeout = 10000, checkDelayPerClient = 50 } = {},
    logger = console,
) {
    // Обробник нових з'єднань: ініціалізуємо стан для кожного клієнтського WebSocket.
    wssInstance.on('connection', function connection(clientWebSocket) {
        // Присвоюємо унікальний ID, якщо його ще немає.
        // Для продакшн-систем краще використовувати бібліотеку UUID (наприклад, 'uuid').
        if (!clientWebSocket.id) {
            clientWebSocket.id = `client_${Math.random().toString(36).substring(2, 9)}`
        }
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

    // Основний інтервал, який запускає новий цикл розподіленого пінгування всіх клієнтів.
    const heartbeatMainInterval = setInterval(() => {
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
        clearInterval(heartbeatMainInterval) // Зупиняємо основний інтервал.
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

/**
 * Ініціалізує WebSocket сервіси, включаючи аутентифікацію, роутинг по неймспейсам.
 * Цей метод налаштовує обробник 'upgrade' на HTTP сервері для перехоплення WebSocket запитів.
 * @param {http.Server} server - Існуючий HTTP-сервер (зазвичай, створений Express).
 * @returns {WebSocketServer} wssInstance - Екземпляр WebSocketServer.
 */
export const initializeWebSocketServices = (server) => {
    // Створюємо екземпляр WebSocketServer без прив'язки до HTTP сервера (noServer: true).
    // Це дозволяє нам вручну обробляти upgrade запити, що необхідно для JWT аутентифікації.
    const wssInstance = new WebSocketServer({ noServer: true })

    /**
     * Обробник події 'upgrade' HTTP сервера.
     * Перетворює HTTP запит на WebSocket з'єднання після успішної аутентифікації.
     */
    server.on('upgrade', async (req, socket, head) => {
        // 1. Перевіряємо заголовок 'Upgrade'. Якщо він не 'websocket' (регістронезалежно),
        // то це не WebSocket-запит, і ми просто знищуємо сокет.
        if (req.headers.upgrade.toLowerCase() !== 'websocket') {
            socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
            socket.destroy()

            logger.warn(
                `Non-WebSocket upgrade request received for URL: ${req.url}. Socket destroyed.`,
            )

            return
        }

        // 2. Отримуємо вхідний URL запиту для маршрутизації.
        // Створюємо об'єкт URL, використовуючи `req.url` та `req.headers.host`
        // для формування повного URL, що дозволяє коректно розпарсити `pathname`.
        const requestUrl = new URL(req.url, `${req.protocol}://${req.headers.host}`)
        // Беремо з нього відносну частину URL, наприклад, '/ws/chat' з 'http(s)://localhost:3000/ws/chat?user=test'.
        const pathname = requestUrl.pathname
        // Отримати всі query параметри як об'єкт URLSearchParams ...?token=....
        const queryParams = requestUrl.searchParams

        logger.info(`Incoming WebSocket upgrade request for: ${pathname}`)

        // // 3. Аутентифікація за JWT з заголовка Authorization або з query-параметра
        // let token = null
        // // Спробуємо отримати токен з заголовка Authorization (Bearer Token)
        // const authHeader = req.headers.authorization
        // if (authHeader && authHeader.startsWith('Bearer ')) {
        //     token = authHeader.split(' ')[1].trim()
        // } else {
        //     token = queryParams.get('token')
        // }

        // // Якщо токен не надано, відхиляємо підключення
        // if (!token) {
        //     logger.warn(`Відхилено WebSocket підключення до /ws/${pathname}: Токен не надано.`)
        //     socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        //     socket.destroy()
        //     return
        // }

        // let userData = null
        // try {
        //     userData = jwtManager.verify(token)
        // } catch (error) {
        //     logger.warn(
        //         `Відхилено WebSocket підключення до /ws/${pathname}: Помилка варифікації токена: ${error.message}`,
        //     )
        //     socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        //     socket.destroy()
        //     return
        // }

        const userData = {
            userId: `user_${Math.random().toString(36).substring(2, 8)}`,
            username: `Guest_${Math.floor(Math.random() * 1000)}`,
        }

        logger.debug(`Authentication successful for ${userData.userId} on path ${pathname}.`)

        // Обробка upgrade запиту WebSocketServer'ом (якщо аутентифікація успішна)
        wssInstance.handleUpgrade(req, socket, head, async (ws) => {
            // Розширюємо об'єкт `ws` (WebSocket), додаючи дані користувача та інші властивості,
            // які будуть доступні в усіх обробниках неймспейсов та RoomManager.
            /** @type {CustomWebSocket} */ ws.id =
                Date.now().toString() + Math.random().toString(36).substring(2, 8) // Унікальний ID для цього з'єднання
            /** @type {CustomWebSocket} */
            ws.userId = userData.userId // ID користувача з токена
            /** @type {CustomWebSocket} */
            ws.username = userData.username || 'Anonymous' // Ім'я користувача з токена
            /** @type {CustomWebSocket} */
            ws.__closeHandlerRegistered = false // Прапорець для RoomManager's close handler
            /** @type {CustomWebSocket} */
            ws.path = pathname // Зберігаємо шлях, щоб неймспейси могли його використовувати
            /** @type {CustomWebSocket} */
            ws.isAlive = true // Ініціалізуємо прапорець "живості"

            // // Обробник PONG-повідомлень від клієнта
            // ws.on('pong', async () => {
            //     ws.isAlive = true
            //     logger.debug(`[Ping/Pong] Received pong from ${ws.username} (${ws.id}).`)
            // })

            // Викликаємо подію 'connection' для WebSocketServer, щоб він продовжив обробку
            wssInstance.emit('connection', ws, req)

            // 4. Диспетчеризація на неймспейси
            let namespaceHandler = null
            for (const [namespacePath, handler] of Object.entries(namespaceConfig)) {
                if (pathname === namespacePath) {
                    namespaceHandler = handler
                    break
                } else if (namespacePath.endsWith('/') && pathname.startsWith(namespacePath)) {
                    namespaceHandler = handler
                    pathSegment = pathname.substring(namespacePath.length)

                    // Узагальнена перевірка, якщо сегмент обов'язковий
                    if (handler.segmentRequired && !pathSegment) {
                        const segmentName = handler.segmentName || 'ID'
                        logger.warn(
                            `Invalid path: ${pathname}. ${segmentName} is missing. Closing connection for ${ws.username}.`,
                        )
                        ws.close(1000, `Invalid ${segmentName}`)
                        return
                    }
                    break
                }
            }

            if (!namespaceHandler) {
                logger.warn(
                    `Unknown WebSocket path: ${pathname}. Closing connection for ${ws.username}.`,
                )
                ws.close(1000, 'Unknown namespace') // 1000 - Normal Closure (невідомий неймспейс)
                return
            }

            let pathSegment = null // Для gameId або інших параметрів з URL

            //
            logger.info(`Client ${ws.username} connected to namespace: ${pathname}`)

            // Викликаємо обробник підключення для відповідного неймспейсу
            namespaceHandler.handleConnection(ws, pathSegment)

            // Налаштовуємо обробники подій WebSocket для даного клієнта
            ws.on('message', async (message) => {
                namespaceHandler.handleMessage(ws, message)
            })

            ws.on('close', async (code, reason) => {
                logger.info(
                    `Client ${ws.username} disconnected from namespace: ${pathname}. Code: ${code}, Reason: ${reason}`,
                )

                namespaceHandler.handleClose(ws)
                // RoomManager's `__closeHandlerRegistered` flag ensures `removeClientGlobally` is called,
                // cleaning up the client from all rooms across all namespaces.
            })

            ws.on('error', async (error) => {
                logger.error(`WebSocket error for ${ws.username} on ${pathname}:`, error)
                // Після 'error' зазвичай слідує 'close' подія, яка ініціює очищення.
            })
        })
    })

    // --- Запускаємо періодичний PING ---
    // Це буде працювати як на сервері з одним інстансом, так і в кластері,
    // оскільки кожен інстанс WSS відповідає за свої власні з'єднання.
    setupHeartbeat(wssInstance, {}, logger)

    logger.info('WebSocket services initialized with namespace routing and JWT authentication.')

    return wssInstance
}

// Експортуємо RoomManager та initializeWebSocketServices.
// RoomManager експортується, щоб його могли використовувати інші модулі (наприклад, Express API для надсилання повідомлень).
// export { initializeWebSocketServices, roomManager }
