// Підключення до неймспейсу /chat
const socket = new WebSocket('ws://localhost:8080/chat')

socket.onopen = () => {
    console.log('З’єднано з сервером')

    // Відправляємо запит на вхід у кімнату
    socket.send(
        JSON.stringify({
            event: 'join_room',
            payload: 'general',
        }),
    )

    // Через 2 секунди відправляємо повідомлення
    setTimeout(() => {
        socket.send(
            JSON.stringify({
                event: 'chat_message',
                payload: { room: 'general', text: 'Привіт із 2026 року!' },
            }),
        )
    }, 2000)
}

// Отримання стандартизованого Envelope від сервера
socket.onmessage = (event) => {
    const data = JSON.parse(event.data)
    console.log(`[${data.event}] від ${data.sender}:`, data.payload)
    console.log(`Мета-дані: NS=${data.ns}, Room=${data.room}, ID=${data.id}`)
}
