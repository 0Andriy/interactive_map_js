// public/client.js
const wsUrlInput = document.getElementById('ws-url-input')
const usernameInput = document.getElementById('username-input')
const passwordInput = document.getElementById('password-input')
const loginBtn = document.getElementById('login-btn')
const connectBtn = document.getElementById('connect-btn')
const messagesDiv = document.getElementById('messages')
const messageInput = document.getElementById('message-input')
const roomInput = document.getElementById('room-input')
const sendMessageBtn = document.querySelector('#input-area button:last-child')
const joinRoomBtn = document.querySelector('#room-actions button:first-child')
const leaveRoomBtn = document.querySelector('#room-actions button:last-child')
const roomInfoDiv = document.getElementById('room-info')

let ws = null
let currentRoom = null
let currentNamespace = null
let jwtToken = null

function appendMessage(sender, content, type = 'chat_message') {
    const messageElement = document.createElement('div')
    messageElement.classList.add('message')
    if (type === 'system_message') {
        messageElement.classList.add('system_message')
    } else if (type === 'error') {
        messageElement.classList.add('error_message')
    }

    if (sender) {
        const senderSpan = document.createElement('span')
        senderSpan.classList.add('sender')
        senderSpan.textContent = sender + ': '
        messageElement.appendChild(senderSpan)
    }
    messageElement.appendChild(document.createTextNode(content))
    messagesDiv.appendChild(messageElement)
    messagesDiv.scrollTop = messagesDiv.scrollHeight
}

async function authenticate() {
    const username = usernameInput.value.trim()
    const password = passwordInput.value.trim()

    if (!username || !password) {
        alert("Будь ласка, введіть ім'я користувача та пароль.")
        return
    }

    appendMessage('Система', 'Спроба автентифікації...', 'system_message')
    try {
        const response = await fetch('/auth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password }),
        })

        const data = await response.json()

        if (response.ok) {
            jwtToken = data.token
            appendMessage('Система', 'Автентифікація успішна. Токен отримано!', 'system_message')
            loginBtn.disabled = true
            usernameInput.disabled = true
            passwordInput.disabled = true
            connectBtn.disabled = false
            wsUrlInput.disabled = false
        } else {
            appendMessage('Помилка автентифікації', data.message || 'Невідома помилка.', 'error')
            jwtToken = null
        }
    } catch (error) {
        console.error('Помилка автентифікації:', error)
        appendMessage(
            'Помилка автентифікації',
            `Не вдалося підключитися до сервера автентифікації: ${error.message}`,
            'error',
        )
        jwtToken = null
    }
}

function connectToWebSocket() {
    if (!jwtToken) {
        alert('Будь ласка, спочатку автентифікуйтесь, щоб отримати JWT токен.')
        return
    }

    const desiredNamespace = wsUrlInput.value.trim().toLowerCase()
    if (!desiredNamespace) {
        alert('Будь ласка, введіть назву неймспейсу (наприклад, "chat", "game").')
        return
    }

    if (ws && ws.readyState === WebSocket.OPEN) {
        appendMessage(
            'Система',
            'Вже підключено. Спочатку відключіться, щоб змінити неймспейс.',
            'system_message',
        )
        return
    }

    // --- ОНОВЛЕНА ЧАСТИНА: Додаємо префікс /ws/ до URL ---
    const wsUrl = `ws://localhost:3000/ws/${desiredNamespace}?token=${jwtToken}`
    ws = new WebSocket(wsUrl)
    currentNamespace = desiredNamespace // Зберігаємо чистий неймспейс

    appendMessage('Система', `Спроба підключення до ${wsUrl}...`, 'system_message')

    ws.onopen = () => {
        appendMessage(
            'Система',
            `Підключено до сервера в неймспейсі /ws/${currentNamespace}.`,
            'system_message',
        )
        roomInput.disabled = false
        joinRoomBtn.disabled = false
        connectBtn.disabled = true
        wsUrlInput.disabled = true
    }

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data)
            switch (data.type) {
                case 'chat_message':
                    appendMessage(data.sender, data.content)
                    break
                case 'system_message':
                    appendMessage('Система', data.content, 'system_message')
                    break
                case 'room_update':
                    // Відображаємо неймспейс з префіксом для користувача
                    roomInfoDiv.textContent = `Ви в кімнаті '${currentRoom}' (/ws/${currentNamespace}). Користувачів: ${
                        data.userCount
                    } (${data.users.join(', ')})`
                    appendMessage('Система', data.message, 'system_message')
                    break
                case 'global_announcement':
                    appendMessage('Оголошення', data.content, 'system_message')
                    break
                case 'error':
                    appendMessage('Помилка', data.message, 'error')
                    break
                default:
                    appendMessage(
                        'Система',
                        `Отримано невідоме повідомлення: ${event.data}`,
                        'system_message',
                    )
            }
        } catch (e) {
            console.error('Помилка парсингу JSON або обробки повідомлення:', e)
            appendMessage('Помилка', `Невідомий формат повідомлення: ${event.data}`, 'error')
        }
    }

    ws.onclose = () => {
        appendMessage(
            'Система',
            `Відключено від сервера (/ws/${currentNamespace || 'невідомий неймспейс'}).`,
            'system_message',
        )
        messageInput.disabled = true
        sendMessageBtn.disabled = true
        roomInput.disabled = true
        joinRoomBtn.disabled = true
        leaveRoomBtn.disabled = true

        usernameInput.disabled = false
        passwordInput.disabled = false
        loginBtn.disabled = false
        connectBtn.disabled = true
        wsUrlInput.disabled = true

        roomInfoDiv.textContent = 'Відключено.'
        currentRoom = null
        currentNamespace = null
        jwtToken = null
    }

    ws.onerror = (error) => {
        appendMessage('Помилка', `Помилка WebSocket: ${error.message}`, 'error')
        console.error('WebSocket Error:', error)
    }
}

// Функції joinRoom, leaveRoom, sendMessage залишаються без змін
// (вони працюють з currentRoom та ws, які вже коректно встановлені)
function joinRoom() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('Спочатку підключіться до сервера.')
        return
    }
    const roomName = roomInput.value.trim()
    if (roomName) {
        if (currentRoom) {
            ws.send(JSON.stringify({ type: 'leave_room', roomName: currentRoom }))
        }
        ws.send(JSON.stringify({ type: 'join_room', roomName: roomName }))
        currentRoom = roomName
        messageInput.disabled = false
        sendMessageBtn.disabled = false
        leaveRoomBtn.disabled = false
        joinRoomBtn.disabled = true
        roomInput.disabled = true
        roomInfoDiv.textContent = `Спроба приєднатися до '${roomName}' (/ws/${currentNamespace})...`
    } else {
        alert('Будь ласка, введіть назву кімнати.')
    }
}

function leaveRoom() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('Ви не підключені до сервера.')
        return
    }
    if (currentRoom) {
        ws.send(JSON.stringify({ type: 'leave_room', roomName: currentRoom }))
        currentRoom = null
        messageInput.disabled = true
        sendMessageBtn.disabled = true
        leaveRoomBtn.disabled = true
        joinRoomBtn.disabled = false
        roomInput.disabled = false
        roomInfoDiv.textContent = 'Не приєднано до кімнати.'
    } else {
        alert('Ви не приєднані до жодної кімнати.')
    }
}

function sendMessage() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('Спочатку підключіться до сервера.')
        return
    }
    const message = messageInput.value.trim()
    if (message && currentRoom) {
        ws.send(JSON.stringify({ type: 'chat_message', content: message }))
        messageInput.value = ''
    } else if (!currentRoom) {
        alert('Будь ласка, приєднайтеся до кімнати, щоб надсилати повідомлення.')
    }
}

// Обробники подій
loginBtn.addEventListener('click', authenticate)
connectBtn.addEventListener('click', connectToWebSocket)
messageInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        sendMessage()
    }
})

function updateButtonStates() {
    sendMessageBtn.disabled = !messageInput.value.trim() || !currentRoom
    joinRoomBtn.disabled =
        !roomInput.value.trim() || !ws || ws.readyState !== WebSocket.OPEN || currentRoom
    leaveRoomBtn.disabled = !currentRoom
    // Кнопка "Підключитися до WS" активна, якщо є токен і введено неймспейс
    connectBtn.disabled = !jwtToken || !wsUrlInput.value.trim()
}

messageInput.addEventListener('input', updateButtonStates)
roomInput.addEventListener('input', updateButtonStates)
wsUrlInput.addEventListener('input', updateButtonStates)

// Ініціалізація стану при завантаженні сторінки
function initializeUI() {
    messageInput.disabled = true
    sendMessageBtn.disabled = true
    roomInput.disabled = true
    joinRoomBtn.disabled = true
    leaveRoomBtn.disabled = true
    connectBtn.disabled = true
    wsUrlInput.disabled = true // Заблоковано, поки не буде JWT
    roomInfoDiv.textContent = 'Будь ласка, автентифікуйтесь.'
    updateButtonStates()
}

document.addEventListener('DOMContentLoaded', initializeUI)
