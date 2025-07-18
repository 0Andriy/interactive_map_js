// server.js (приклад)

import express from 'express'
import { createServer } from 'http'
import WebSocketApplication from './WebSocketApplication.js'
import { createLogger } from './logger.js'
// ... інші імпорти (роутери, middleware тощо)

const logger = createLogger('Server')
const app = express()
const server = createServer(app) // Створюємо HTTP сервер для Express

// Ініціалізуємо WebSocketApplication
const wsApp = new WebSocketApplication({
    server: server, // Прив'язуємо WS до існуючого HTTP сервера
    defaultNamespaceName: 'chat',
    logger: logger,
    heartbeatOptions: {}, // Передаємо опції heartbeat
    // ... інші опції, наприклад, pathPrefixes: ['ws']
})

// Передаємо мапу #allConnectedClients з wsApp для heartbeat
// Важливо: #allConnectedClients - це приватне поле, тому зробимо геттер
// АБО передаємо його напряму в конструктор setupHeartbeat
// Оскільки setupHeartbeat знаходиться у вас в файлі heartbeat.js, і він імпортується та викликається в WebSocketApplication,
// тоді WebSocketApplication має передати свою #allConnectedClients до setupHeartbeat.
// Якщо ви оновили ConnectedClient та heartbeat.js як я пропонував раніше,
// то вам потрібно буде переконатися, що wsApp.#allConnectedClients доступний для setupHeartbeat.
// Найпростіший спосіб - додати геттер для #allConnectedClients в WebSocketApplication,
// або ж, що краще, якщо setupHeartbeat викликається всередині WebSocketApplication,
// то WebSocketApplication сам передасть свою #allConnectedClients.

// --- Передача #allConnectedClients у setupHeartbeat, якщо ви не робили це раніше ---
// У WebSocketApplication.js, в конструкторі:
// setupHeartbeat(this.#wss, heartbeatOptions, this.#logger, this.#allConnectedClients);
// Це вже має бути зроблено, якщо ви слідували попереднім рекомендаціям.
// ----------------------------------------------------------------------------------

// Middleware для Express (наприклад, для парсингу JSON)
app.use(express.json())

// ************ Важлива частина: робимо wsApp доступним для роутерів ************
// Можна додати wsApp як властивість до об'єкта `req`
app.use((req, res, next) => {
    req.wsApp = wsApp
    next()
})

// Або передати його напряму в роутери
// import apiRouter from './routes/api.js';
// app.use('/api', apiRouter(wsApp)); // Приклад, якщо apiRouter - це функція, що приймає wsApp

// Наш REST API маршрут
app.post('/api/external-event', (req, res) => {
    logger.info('Received POST request to /api/external-event', { body: req.body })

    const { targetUserId, message, namespace, room } = req.body

    if (!targetUserId && !namespace && !room) {
        return res.status(400).json({
            success: false,
            message: 'Missing targetUserId, namespace, or room in request body.',
        })
    }

    try {
        let clientsSentTo = 0
        let messageSentSuccessfully = false

        // Варіант 1: Відправити конкретному користувачу (всі його з'єднання)
        if (targetUserId) {
            // Допустимо, у вашому WebSocketApplication є метод для отримання клієнтів за userId
            // Якщо ні, вам потрібно буде перебрати #allConnectedClients вручну
            const clientsForUser = Array.from(wsApp.allConnectedClients.values()).filter(
                (client) => client.userId === targetUserId,
            )

            if (clientsForUser.length > 0) {
                clientsForUser.forEach((client) => {
                    if (client.isAuthenticated) {
                        client.send({
                            type: 'EXTERNAL_NOTIFICATION',
                            payload: message || 'External event occurred.',
                        })
                        clientsSentTo++
                        messageSentSuccessfully = true
                    }
                })
                logger.info(
                    `Sent notification to ${clientsSentTo} connections for user ${targetUserId}.`,
                )
            } else {
                logger.warn(`No active connections found for user ${targetUserId}.`)
            }
        }

        // Варіант 2: Відправити в конкретний namespace та/або кімнату
        else if (namespace) {
            const targetNamespace = wsApp.getNamespace(namespace)
            if (targetNamespace) {
                if (room) {
                    const targetRoom = targetNamespace.getRoom(room)
                    if (targetRoom) {
                        targetRoom.broadcast({
                            type: 'EXTERNAL_NOTIFICATION',
                            payload: message || 'External event occurred.',
                        })
                        clientsSentTo = targetRoom.totalClients // Приблизно
                        messageSentSuccessfully = true
                        logger.info(
                            `Broadcast notification to room '${room}' in namespace '${namespace}'. Sent to ${clientsSentTo} clients.`,
                        )
                    } else {
                        logger.warn(`Room '${room}' not found in namespace '${namespace}'.`)
                    }
                } else {
                    // Якщо кімната не вказана, надсилаємо всім клієнтам у Namespace
                    Array.from(targetNamespace.clients.values()).forEach((client) => {
                        // Вам може знадобитися геттер для #clients у Namespace
                        client.send({
                            type: 'EXTERNAL_NOTIFICATION',
                            payload: message || 'External event occurred.',
                        })
                        clientsSentTo++
                        messageSentSuccessfully = true
                    })
                    logger.info(
                        `Broadcast notification to all clients in namespace '${namespace}'. Sent to ${clientsSentTo} clients.`,
                    )
                }
            } else {
                logger.warn(`Namespace '${namespace}' not found.`)
            }
        }

        // Варіант 3: Відправити всім підключеним клієнтам (глобально)
        else {
            wsApp.broadcast({
                type: 'EXTERNAL_NOTIFICATION',
                payload: message || 'External event occurred.',
            })
            clientsSentTo = wsApp.totalClients
            messageSentSuccessfully = true
            logger.info(
                `Broadcast notification to all connected clients globally. Sent to ${clientsSentTo} clients.`,
            )
        }

        if (messageSentSuccessfully) {
            res.status(200).json({
                success: true,
                message: `Notification sent successfully to ${clientsSentTo} clients.`,
            })
        } else {
            res.status(404).json({
                success: false,
                message: 'No target found or message not sent.',
            })
        }
    } catch (error) {
        logger.error('Error sending WS message from REST API:', error)
        res.status(500).json({
            success: false,
            message: 'Internal server error while sending WS message.',
        })
    }
})

// Запускаємо HTTP сервер
const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
    logger.info(`HTTP/WS server listening on port ${PORT}`)
})

// ********** Важливо: щоб отримати доступ до #allConnectedClients з wsApp
// додайте геттер в WebSocketApplication.js
// У WebSocketApplication.js:
// get allConnectedClients() {
//     return this.#allConnectedClients;
// }
// І також геттер для #clients у Namespace.js, якщо хочете відправляти в Namespace без кімнати:
// get clients() {
//     return this.#clients;
// }






// export default function apiRouter(wsAppInstance, logger) {
//     // Приймаємо wsAppInstance
//     const router = express.Router()

//     router.post('/external-event', (req, res) => {
//         // Тепер wsAppInstance доступний тут
//         // ... логіка відправки повідомлень через wsAppInstance
//     })

//     return router
// }
