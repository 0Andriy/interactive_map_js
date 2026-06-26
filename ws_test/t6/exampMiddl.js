// Перелік дозволених префіксів для кімнат
const ROOM_TYPES = {
    USER: 'user:',
    ROOM: 'room:',
    SID: 'sid:',
}

/**
 * Валідує доступ користувача до кімнати на основі її префіксу.
 * @param {Object} user - Об'єкт користувача з сокета (socket.user)
 * @param {string} socketId - Поточний socket.id відправника
 * @param {string} roomName - Назва кімнати, куди намагаються зайти/надіслати
 * @param {string} action - Дія: 'join' або 'send'
 * @returns {Promise<{allowed: boolean, reason?: string}>}
 */
async function validateRoomAccess(user, socketId, roomName, action) {
    // 1. Перевірка кімнат користувачів (user:userId)
    if (roomName.startsWith(ROOM_TYPES.USER)) {
        const targetUserId = roomName.replace(ROOM_TYPES.USER, '')

        // У свою кімнату можна і зайти, і слати. В чужу — зась.
        if (targetUserId !== user.id) {
            return {
                allowed: false,
                reason: 'Доступ до приватної кімнати іншого користувача заборонено',
            }
        }
        return { allowed: true }
    }

    // 2. Перевірка кімнат сокетів (sid:socketId)
    if (roomName.startsWith(ROOM_TYPES.SID)) {
        const targetSocketId = roomName.replace(ROOM_TYPES.SID, '')

        // Дозволено взаємодіяти ТІЛЬКИ зі своїм власним sid
        if (targetSocketId !== socketId) {
            return { allowed: false, reason: 'Доступ до чужого пристрою (sid) заборонено' }
        }
        return { allowed: true }
    }

    // 3. Перевірка групових / публічних кімнат (room:chatId)
    if (roomName.startsWith(ROOM_TYPES.ROOM)) {
        // Якщо користувач хоче надіслати повідомлення, але івент загальний —
        // тут ми просто дозволяємо, а фізичну наявність у кімнаті перевіримо через socket.rooms (див. Крок 2)
        if (action === 'send') return { allowed: true }

        // Якщо користувач намагається ЗАЙТИ (join) в групову кімнату — перевіряємо БД
        try {
            const chatId = roomName.replace(ROOM_TYPES.ROOM, '')
            // Тут ваш реальний запит до БД (Prisma, Mongoose, Postgres тощо)
            // const isMember = await db.checkMembership(user.id, chatId);
            const isMember = true // Тимчасова заглушка

            if (!isMember) {
                return { allowed: false, reason: 'Ви не є учасником цього чату' }
            }
            return { allowed: true }
        } catch (error) {
            return { allowed: false, reason: 'Помилка сервера при перевірці прав' }
        }
    }

    // Якщо кімната не має жодного відомого префіксу
    return { allowed: false, reason: 'Невідомий або некоректний формат кімнати' }
}

module.exports = { validateRoomAccess }
