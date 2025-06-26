// src/websockets/WebSocketMessageHandler.js

class WebSocketMessageHandler {
    constructor(wsManagerInstance) {
        // Отримуємо посилання на екземпляр WebSocketManager.
        // Це дозволить MessageHandler'у викликати методи WebSocketManager'а,
        // такі як sendToRoom, joinClientToRoom, sendError тощо.
        this.wsManager = wsManagerInstance
        this.logger = wsManagerInstance.logger || console // Використовуємо логер менеджера
    }

    /**
     * Обробляє вхідне WebSocket-повідомлення.
     * Цей метод буде викликатися з WebSocketManager.
     * @param {Object} ws - Об'єкт WebSocket-з'єднання клієнта (з authInfo та userId).
     * @param {Object} message - Розпарсований об'єкт повідомлення від клієнта.
     * @param {string} userId - ID користувача, який надіслав повідомлення.
     * @param {Array<string>} userRoles - Ролі користувача (з payload токена).
     */
    async handleMessage(ws, message, userId, userRoles) {
        this.logger.debug(
            `[MessageHandler] Отримано повідомлення типу '${message.type}' від ${userId}`,
        )

        // Приклад перевірки ролей:
        const canChat = userRoles.includes('user') || userRoles.includes('admin')
        const isAdmin = userRoles.includes('admin')

        try {
            switch (message.type) {
                case 'join':
                    if (message.roomName) {
                        // Викликаємо метод WebSocketManager для приєднання
                        this.wsManager.joinClientToRoom(
                            ws,
                            message.roomName,
                            message.dataSourceMethod,
                            message.dataParameters,
                        )
                    } else {
                        this.wsManager.sendError(ws, 'join', "Назва кімнати обов'язкова.")
                    }
                    break

                case 'leave':
                    if (message.roomName) {
                        // Викликаємо метод WebSocketManager для виходу
                        this.wsManager.leaveClientFromRoom(ws, message.roomName)
                    } else {
                        this.wsManager.sendError(ws, 'leave', "Назва кімнати обов'язкова.")
                    }
                    break

                case 'chatMessage':
                    if (!canChat) {
                        this.wsManager.sendError(
                            ws,
                            'chatMessage',
                            'Доступ заборонено: Недостатньо прав для надсилання повідомлень у чат.',
                        )
                        return
                    }
                    if (message.roomName && message.text) {
                        // Перевіряємо, чи клієнт дійсно є учасником цієї кімнати
                        if (this.wsManager.isClientInRoom(ws, message.roomName)) {
                            // Надсилаємо повідомлення всім у кімнаті через WebSocketManager
                            this.wsManager.sendToRoom(message.roomName, {
                                type: 'chatMessage',
                                roomName: message.roomName,
                                sender: userId, // Використовуємо реальний userId
                                text: message.text,
                                timestamp: new Date().toISOString(),
                            })
                        } else {
                            this.wsManager.sendError(
                                ws,
                                'chatMessage',
                                `Ви не є учасником кімнати '${message.roomName}'.`,
                            )
                        }
                    } else {
                        this.wsManager.sendError(
                            ws,
                            'chatMessage',
                            "Назва кімнати та текст повідомлення обов'язкові для chatMessage.",
                        )
                    }
                    break

                // --- ТУТ ВИ ДОДАЄТЕ НОВУ ЛОГІКУ АБО ЗМІНЮЄТЕ ІСНУЮЧУ ---
                case 'adminCommand':
                    if (!isAdmin) {
                        this.wsManager.sendError(
                            ws,
                            'adminCommand',
                            'Доступ заборонено: Потрібні права адміністратора.',
                        )
                        return
                    }
                    if (message.command === 'restartServer') {
                        this.logger.warn(`[ADMIN] Команда: Перезапуск сервера від ${userId}!`)
                        this.wsManager.sendMessage(ws, {
                            type: 'commandResult',
                            status: 'success',
                            message: 'Запит на перезапуск прийнято.',
                        })
                        // Тут може бути реальна логіка перезапуску або виклику іншого сервісу
                    } else {
                        this.wsManager.sendError(
                            ws,
                            'adminCommand',
                            'Невідома команда адміністратора.',
                        )
                    }
                    break
                // --- КІНЕЦЬ НОВОЇ/ЗМІНЕНОЇ ЛОГІКИ ---

                default:
                    this.wsManager.sendError(
                        ws,
                        'unknown',
                        `Невідомий тип повідомлення: ${message.type}`,
                    )
                    this.logger.warn(
                        `[MessageHandler] Отримано невідомий тип повідомлення: ${message.type} від ${userId}`,
                    )
            }
        } catch (error) {
            this.logger.error(
                `[MessageHandler] Помилка обробки повідомлення типу '${message.type}' від ${userId}:`,
                error,
            )
            this.wsManager.sendError(
                ws,
                'processingError',
                `Помилка обробки повідомлення: ${error.message}`,
            )
        }
    }
}

export default WebSocketMessageHandler
