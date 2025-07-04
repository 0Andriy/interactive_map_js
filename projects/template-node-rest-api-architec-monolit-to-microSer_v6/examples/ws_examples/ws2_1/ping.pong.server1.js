const WebSocket = require('ws')
// Якщо використовуєте UUID для тимчасових ID до аутентифікації
// const { v4: uuidv4 } = require('uuid');

const wss = new WebSocket.Server({ port: 8080 })

let interval

wss.on('connection', (ws) => {
    ws.isAlive = true
    ws.on('pong', () => {
        ws.isAlive = true
    })

    // При підключенні, ми можемо присвоїти тимчасовий ID або одразу ID користувача, якщо він відомий
    // Наприклад, якщо ID користувача передається в URL з'єднання:
    // const userId = new URLSearchParams(ws.url.split('?')[1]).get('userId');
    // ws.id = userId || uuidv4(); // Якщо userId є, використовуємо його, інакше - тимчасовий UUID

    // Більш поширений сценарій: аутентифікація через повідомлення
    // Спочатку присвоїмо тимчасовий ID для з'єднання
    ws.id = `temp_${Math.random().toString(36).substring(2, 8)}`
    console.log(`New WebSocket connection established with temporary ID: ${ws.id}`)

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message)

            // ====== Ключовий момент: Аутентифікація та присвоєння ID користувача ======
            if (data.type === 'authenticate') {
                // У реальному додатку тут буде перевірка токена, логіна/пароля тощо.
                // Припустимо, після успішної перевірки, ви отримуєте реальний userId.
                const userRealId = data.userId // Приклад: userId передається в повідомленні

                // Перевірка, чи userRealId вже не зайнятий іншим активним з'єднанням (якщо це singleton-з'єднання)
                let existingWsForUser = null
                wss.clients.forEach((client) => {
                    if (client.id === userRealId && client !== ws) {
                        existingWsForUser = client
                    }
                })

                if (existingWsForUser) {
                    // Якщо користувач вже підключений, можна закрити старе з'єднання
                    console.warn(
                        `User ${userRealId} tried to connect with new session. Closing old session.`,
                    )
                    existingWsForUser.send(
                        JSON.stringify({
                            type: 'error',
                            message: 'New session started. Your old session was terminated.',
                        }),
                    )
                    existingWsForUser.terminate()
                }

                // Переприсвоюємо ID з'єднання на ID користувача
                ws.id = userRealId
                console.log(
                    `WebSocket connection ${ws.id} successfully authenticated as user ID: ${ws.id}`,
                )
                ws.send(JSON.stringify({ type: 'authSuccess', userId: ws.id }))

                // Тепер ви можете додати його до кімнат або виконати інші дії, пов'язані з користувачем
                // roomsManager.addClient(ws); // Якщо у вас є RoomsManager
                // roomsManager.joinRoom(ws, 'general'); // Приєднати до загальної кімнати
            } else if (!ws.id.startsWith('temp_')) {
                // Обробляємо повідомлення лише від аутентифікованих користувачів
                // Ваша існуюча логіка обробки повідомлень (joinRoom, chatMessage тощо)
                // Використовуйте ws.id як ідентифікатор користувача
                switch (data.type) {
                    case 'joinRoom':
                        // ... ваша логіка joinRoom, використовуючи ws.id як ID користувача
                        console.log(`User ${ws.id} wants to join room ${data.room}`)
                        break
                    case 'chatMessage':
                        // ... ваша логіка chatMessage, використовуючи ws.id як ID відправника
                        console.log(
                            `User ${ws.id} sent message: ${data.message} to room ${data.room}`,
                        )
                        break
                    default:
                        console.log(
                            `Received unknown message type '${data.type}' from user ${ws.id}:`,
                            data,
                        )
                }
            } else {
                // Відхилити повідомлення, доки користувач не аутентифікований
                ws.send(JSON.stringify({ type: 'error', message: 'Please authenticate first.' }))
                console.warn(`Blocked message from unauthenticated client ${ws.id}: ${message}`)
            }
        } catch (error) {
            console.error('Failed to parse message or handle:', error)
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format.' }))
        }
    })

    ws.on('close', (code, reason) => {
        console.log(`Client ${ws.id} disconnected. Code: ${code}, Reason: ${reason}`)
        // Видалити з усіх кімнат, використовуючи ws.id
        // roomsManager.removeClient(ws);
    })

    ws.on('error', (error) => {
        console.error(`WebSocket error for client ${ws.id}:`, error)
    })
})

interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            console.warn(`Client ${ws.id} is not alive. Terminating connection.`)
            return ws.terminate()
        }
        ws.isAlive = false
        ws.ping()
    })
}, 30000)

wss.on('close', () => {
    clearInterval(interval)
    console.log('WebSocket server closed. Ping-Pong interval cleared.')
})

console.log('WebSocket server started on port 8080')
