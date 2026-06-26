/**
 * Контролер кімнат чату
 * @param {import('../modules/socket-engine/core/Namespace.js').Namespace} chatNsp
 */
export function registerChatController(chatNsp) {
    // Мідлвар авторизації (ізольований суто для чату)
    chatNsp.use((socket, next) => {
        const token = socket.handshake.query.token
        if (token === 'valid_token') {
            socket.user = { id: '42', name: 'Ivan' } // Зберігаємо дані в сесію сокета
            return next()
        }
        next(new Error('Chat auth failed'))
    })

    // Обробка підключення клієнта
    chatNsp.on('connection', (socket) => {
        socket.on('join_chat', (roomName) => {
            socket.join(roomName)
            // Бродкаст усім в кімнаті, окрім відправника
            socket.to(roomName).emit('user_status', `${socket.user.name} зайшов у чат`)
        })

        socket.on('message', (payload, callback) => {
            const { roomName, text } = payload

            // Розсилка через простір імен усім
            chatNsp.to(roomName).emit('new_msg', { from: socket.user.name, text })

            // Повертаємо клієнту ACK підтвердження
            if (typeof callback === 'function') {
                callback({ success: true, deliveredAt: Date.now() })
            }
        })
    })
}
