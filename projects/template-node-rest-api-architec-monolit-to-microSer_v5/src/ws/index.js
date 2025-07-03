/**
 * @file Центральний модуль для ініціалізації та управління WebSocket сервісами.
 * Відповідає за аутентифікацію, роутинг WebSocket з'єднань на відповідні неймспейси
 * та управління життєвим циклом RoomManager.
 */

import http from 'http'
import { WebSocketServer } from 'ws'
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

function setupHeartbeat(wssInstance, pingInterval = 30000, checkDelayPerClient = 100) {
    wssInstance.on('connection', function connection(ws) {
        ws.isAlive = true
        ws.on('pong', () => {
            ws.isAlive = true
        })
    })

    let currentClientIndex = 0
    const clientsArray = [] // Масив для ітерації, оскільки Set не гарантує порядок

    const heartbeatInterval = setInterval(function ping() {
        // Очищаємо та заповнюємо масив клієнтів на кожній ітерації основного інтервалу
        clientsArray.length = 0 // Очистити масив
        wssInstance.clients.forEach((client) => clientsArray.push(client))

        if (clientsArray.length === 0) {
            currentClientIndex = 0
            return // Якщо немає клієнтів, нічого не робити
        }

        let clientsCheckedInThisCycle = 0
        let clientCheckTimer = null

        const checkNextClient = () => {
            if (currentClientIndex >= clientsArray.length) {
                // Досягнуто кінця списку, скидаємо для наступного циклу
                currentClientIndex = 0
                clearTimeout(clientCheckTimer)
                return
            }

            const ws = clientsArray[currentClientIndex]

            // Важливо: перевірити, чи з'єднання все ще OPEN, оскільки воно могло закритись асинхронно
            if (ws && ws.readyState === ws.OPEN) {
                if (ws.isAlive === false) {
                    console.warn(
                        `WebSocket client (${
                            ws.id || 'N/A'
                        }) did not respond to ping, terminating connection.`,
                    )
                    ws.terminate()
                } else {
                    ws.isAlive = false // Позначаємо як неживе до наступного PONG
                    ws.ping() // Надсилаємо нативний PING фрейм
                }
            }

            currentClientIndex++
            clientsCheckedInThisCycle++

            // Плануємо перевірку наступного клієнта
            if (currentClientIndex < clientsArray.length) {
                clientCheckTimer = setTimeout(checkNextClient, checkDelayPerClient)
            }
        }

        checkNextClient() // Починаємо перевірку з першого клієнта
    }, pingInterval) // Основний інтервал запуску проходу по всіх клієнтах

    wssInstance.on('close', function close() {
        clearInterval(heartbeatInterval)
        // Додатково очистити таймер, якщо він ще активний
        // (хоча після clearInterval це може бути не суттєво)
        // clearTimeout(clientCheckTimer);
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
            userId: 12,
            username: 'TESTER',
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

            // Обробник PONG-повідомлень від клієнта
            ws.on('pong', async () => {
                ws.isAlive = true
                logger.debug(`[Ping/Pong] Received pong from ${ws.username} (${ws.id}).`)
            })

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
                // Спочатку видаляємо клієнта з усіх кімнат через RoomManager
                await roomManager.removeClientGlobally(ws)

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
    // pingIntervalHandle = setInterval(() => {
    //     wssInstance.clients.forEach((ws) => {
    //         // Перевіряємо, чи клієнт відповів на попередній PING
    //         if (ws.isAlive === false) {
    //             logger.warn(
    //                 `[Ping/Pong] Client ${ws.username} (${ws.id}) did not respond to ping. Terminating connection.`,
    //             )
    //             return ws.terminate() // Закриваємо з'єднання, якщо немає відповіді
    //         }

    //         ws.isAlive = false // Скидаємо прапорець перед надсиланням нового PING
    //         // Надсилаємо PING
    //         ws.ping(() => {
    //             /* callback is optional */
    //         })
    //         logger.debug(`[Ping/Pong] Sent ping to ${ws.username} (${ws.id}).`)
    //     })
    // }, PING_INTERVAL_MS)

    // pingInterval: кожні 30 секунд запускаємо прохід по всіх клієнтах
    // checkDelayPerClient: затримка 50 мс між перевірками кожного клієнта
    setupHeartbeat(wssInstance, 30000, 50)

    logger.info('WebSocket services initialized with namespace routing and JWT authentication.')

    return wssInstance
}

// Експортуємо RoomManager та initializeWebSocketServices.
// RoomManager експортується, щоб його могли використовувати інші модулі (наприклад, Express API для надсилання повідомлень).
// export { initializeWebSocketServices, roomManager }
