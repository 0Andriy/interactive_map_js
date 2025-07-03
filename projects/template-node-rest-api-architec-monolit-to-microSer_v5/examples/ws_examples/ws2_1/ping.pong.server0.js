import WebSocket from 'ws'

const wss = new WebSocket.Server({ port: 8080 })

// Змінна для зберігання інтервалу Ping-Pong
let interval

wss.on('connection', (ws) => {
    // Встановлюємо початковий стан 'isAlive' для кожного нового з'єднання
    // Це флаг, який ми будемо скидати перед кожним Ping і перевіряти після очікування Pong
    ws.isAlive = true

    // Обробник отримання Pong-кадру від клієнта
    // Коли клієнт відповідає Pong, ми встановлюємо 'isAlive' в true
    ws.on('pong', () => {
        ws.isAlive = true
        // console.log(`Client ${ws.id || 'N/A'} responded with Pong.`);
    })

    ws.on('message', (message) => {
        // Обробка звичайних повідомлень від клієнта
        console.log(`Received message from client ${ws.id || 'N/A'}: ${message}`)
        ws.send(`Echo: ${message}`)
    })

    ws.on('close', (code, reason) => {
        console.log(`Client ${ws.id || 'N/A'} disconnected. Code: ${code}, Reason: ${reason}`)
    })

    ws.on('error', (error) => {
        console.error(`WebSocket error for client ${ws.id || 'N/A'}:`, error)
    })
})

// Запускаємо інтервал для перевірки активності клієнтів
// Цей інтервал буде виконуватися періодично для всіх підключених клієнтів
interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        // Якщо клієнт не відповів на попередній Ping (isAlive все ще false),
        // це означає, що він "мертвий" або з'єднання розірване. Закриваємо його.
        if (ws.isAlive === false) {
            console.warn(`Client ${ws.id || 'N/A'} is not alive. Terminating connection.`)
            return ws.terminate() // Примусово закриває з'єднання
        }

        // Встановлюємо isAlive в false перед відправкою Ping.
        // Якщо клієнт живий, він відповість Pong, і isAlive знову стане true.
        ws.isAlive = false
        ws.ping() // Відправляємо Ping-кадр клієнту
        // console.log(`Sent Ping to client ${ws.id || 'N/A'}`);
    })
}, 30000) // Інтервал перевірки: кожні 30 секунд (30000 мс)

// Обробка закриття сервера для очищення інтервалу
wss.on('close', () => {
    clearInterval(interval)
    console.log('WebSocket server closed. Ping-Pong interval cleared.')
})

console.log('WebSocket server started on port 8080')

// Опціонально: Додаємо унікальний ID до кожного WebSocket з'єднання для кращого логування
wss.on('connection', (ws) => {
    // В реальному проекті ви можете використовувати бібліотеку 'uuid'
    // const { v4: uuidv4 } = require('uuid');
    // ws.id = uuidv4();
    ws.id = Math.random().toString(36).substring(2, 8) // Простий тимчасовий ID
    console.log(`New client connected with ID: ${ws.id}`)
})
