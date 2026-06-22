import { Scheduler } from '../utils/Scheduler.js'

//
export function initNsp(app, logger = null) {
    const chatNsp = app.of('/chat')
    const scheduler = new Scheduler(logger)

    // Graceful Shutdown
    process.on('SIGTERM', async () => {
        await scheduler.stopAll()
    })

    // --- 1. ДОПОМІЖНІ ФУНКЦІЇ (Internal Helpers) ---

    const wrapEmit = (target, event, data) => {
        target.emit(event, { event, ...data, timestamp: Date.now() })
    }

    const broadcastRoomUpdate = (roomName) => {
        const size = chatNsp.getRoomSize(roomName)
        wrapEmit(chatNsp.to(roomName), 'room_stats', {
            room: roomName,
            onlineCount: size,
        })
    }

    // --- 2. ОПИС ЗАДАЧ (Декларативний підхід) ---
    const backgroundTasks = [
        {
            id: 'server-metrics',
            config: {
                intervalMs: 30000,
                runOnActivation: true,
            },
            execute: async () => {
                const totalOnline = chatNsp.sockets.size
                if (totalOnline > 0) {
                    chatNsp.emit('server_metrics', {
                        event: 'server_metrics',
                        onlineTotal: totalOnline,
                        timestamp: Date.now(),
                    })
                }
            },
        },
        {
            id: 'room1-random-numbers',
            config: {
                intervalMs: 5000, // кожні 5 секунд
                // ЗАДАЧА ПРАЦЮЄ ТІЛЬКИ ЯКЩО В КІМНАТІ room1 Є ЛЮДИ
                condition: () => {
                    const size = chatNsp.adapter.rooms.get('room1')?.size || 0
                    return size > 0
                },
            },
            execute: async () => {
                const randomNumber = Math.floor(Math.random() * 100)
                wrapEmit(chatNsp.to('room1'), 'random_update', { number: randomNumber })
                logger?.debug?.(`Sent random number ${randomNumber} to room1`)
            },
        },
        {
            id: 'db-cleanup',
            config: {
                intervalMs: 1000 * 60 * 60,
            },
            execute: async () => {
                // await db.deleteOldMessages()
                logger?.info?.('Database cleanup performed')
            },
        },
        {
            id: 'health-check',
            config: {
                intervalMs: 1000 * 60 * 5,
            },
            execute: async () => {
                // Ваша логіка перевірки здоров'я неймспейсу
            },
        },
    ]

    // --- РЕЄСТРАЦІЯ ЧЕРЕЗ ЦИКЛ ---
    // Додаємо всі задачі з масиву в планувальник
    for (const task of backgroundTasks) {
        scheduler
            .schedule(task.id, task.execute, task.config)
            .catch((err) => logger?.error?.(`Failed to schedule ${task.id}:`, err))
    }

    // -------------------------------------------------------------
    // --- 3. SOCKET  ЛОГІКА ---
    chatNsp.use((ctx, next) => {
        const handshake = ctx.socket.handshake
        logger?.info?.(`Middleware data`, { handshake })

        // Емуляція авторизації
        ctx.socket.data.user = {
            id: `Guest-${ctx.socket.id.slice(0, 4)}`,
            name: `Guest_${ctx.socket.id.slice(0, 4)}`,
        }
        next()
    })

    chatNsp.on('connection', async (socket) => {
        const user = socket.data.user
        console.log(`Connected: ${user.name}`)

        // 1. Повідомляємо самого користувача про успішне підключення
        wrapEmit(socket, 'connection_established', {
            welcome: `Вітаємо, ${user.name}`,
            yourId: user.id,
        })

        // 2. ПРИЄДНАННЯ ДО КІМНАТИ
        socket.on('join_room', (payload) => {
            const roomName = payload.room
            if (!roomName) return

            socket.join(roomName)

            // Інформуємо учасників кімнати
            wrapEmit(socket.to(roomName), 'user_joined', {
                userId: user.id,
                userName: user.name,
                message: `${user.name} приєднався до чату`,
            })

            // Надсилаємо оновлену статистику кімнати
            broadcastRoomUpdate(roomName)

            // Підтвердження самому користувачу
            wrapEmit(socket, 'joined_success', { room: roomName })

            // ЛОГІКА АКТИВАЦІЇ:
            // Якщо хтось зайшов у room1, і задача зараз НЕ активна (бо була зупинена умовою condition)
            // ми пробуємо її запустити знову.
            if (roomName === 'room1' && !scheduler.has('room1-random-numbers')) {
                const task = backgroundTasks.find((t) => t.id === 'room1-random-numbers')
                scheduler.schedule(task.id, task.execute, task.config)
                logger?.info?.('Room1 active. Random number generator started.')
            }
        })

        // 3. ВИХІД З КІМНАТИ
        socket.on('leave_room', (payload) => {
            const roomName = payload.room
            if (socket.hasRoom(roomName)) {
                socket.leave(roomName)

                wrapEmit(socket.to(roomName), 'user_left', {
                    userId: user.id,
                    userName: user.name,
                })

                broadcastRoomUpdate(roomName)
            }
        })

        // 4. ПОВІДОМЛЕННЯ В КІМНАТУ (ЧАТ)
        socket.on('send_message', (payload) => {
            const { room, text } = payload
            if (socket.hasRoom(room)) {
                // Розсилка всім у кімнаті (включаючи себе або через socket.to().emit для інших)
                wrapEmit(chatNsp.to(room), 'new_message', {
                    senderId: user.id,
                    senderName: user.name,
                    text: text,
                })
            }
        })

        // 5. ТАЙПІНГ (TYPING INDICATOR)
        socket.on('typing_start', (payload) => {
            // Повідомляємо інших у кімнаті, що ми пишемо
            socket.to(payload.room).emit('user_typing', {
                event: 'user_typing',
                data: { userId: user.id, userName: user.name, isTyping: true },
            })
        })

        // socket.on('typing_stop', (payload) => {
        //     // Повідомляємо інших у кімнаті, що ми ПЕРЕСТАЛИ писати
        //     socket.to(payload.room).emit('user_typing', {
        //         event: 'user_typing',
        //         data: { userId: user.id, userName: user.name, isTyping: false },
        //     })
        // })

        // 6. ГЛОБАЛЬНА РОЗСИЛКА (Наприклад, оголошення від адміна)
        socket.on('broadcast', (payload) => {
            // Відправляємо взагалі всім у неймспейсі /chat
            wrapEmit(chatNsp, 'global_announcement', {
                content: payload.message,
            })
        })

        // 7. ОБРОБКА ВІДКЛЮЧЕННЯ (Disconnect)
        socket.on('disconnect', () => {
            // Автоматично проходимо по всіх кімнатах, де був сокет, щоб оновити лічильники
            // В деяких реалізаціях socket.rooms очищується миттєво,
            // тому список кімнат варто зберігати в socket.data.myRooms
            console.log(`User ${user.name} disconnected`)
        })
    })

    // Глобальний інтервал для моніторингу загального онлайну
    setInterval(() => {
        const totalOnline = chatNsp.sockets.size // або метод вашого Server.js
        if (totalOnline > 0) {
            wrapEmit(chatNsp, 'server_metrics', { onlineTotal: totalOnline })
        }
    }, 30000)
}
