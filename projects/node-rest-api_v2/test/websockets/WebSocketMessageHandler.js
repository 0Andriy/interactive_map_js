// src/websockets/WebSocketMessageHandler.js

/**
 * WebSocketMessageHandler відповідає за розбір та обробку конкретних типів повідомлень,
 * що надходять від WebSocket-клієнтів. Він взаємодіє з WebSocketManager для виконання дій.
 */
class WebSocketMessageHandler {
    /**
     * Створює екземпляр WebSocketMessageHandler.
     * @param {Object} wsManagerInstance - Екземпляр WebSocketManager, з яким буде взаємодіяти обробник.
     * Це може бути `null` під час початкової ініціалізації,
     * і встановлено пізніше (`myMessageHandler.wsManager = wsManager;`).
     */
    constructor(wsManagerInstance) {
        this.wsManager = wsManagerInstance // Зберігаємо посилання на WebSocketManager
        // Якщо wsManagerInstance ще не встановлено, використовуємо console як заглушку
        this.logger = wsManagerInstance ? wsManagerInstance.logger : console
    }

    /**
     * Обробляє вхідні WebSocket-повідомлення.
     * @param {Object} ws - Об'єкт WebSocket-з'єднання клієнта.
     * @param {Object} message - Розпарсований об'єкт повідомлення від клієнта.
     * @param {string} userId - ID користувача, який надіслав повідомлення.
     * @param {Array<string>} userRoles - Ролі користувача.
     */
    async handleMessage(ws, message, userId, userRoles) {
        // Перевіряємо, чи wsManager вже встановлений. Це потрібно, якщо обробник був створений з null.
        if (!this.wsManager) {
            this.logger.error(
                `[MessageHandler] WebSocketManager не ініціалізовано. Не можу обробити повідомлення '${message.type}'.`,
            )
            // Можливо, відправити помилку назад клієнту, якщо це можливо
            return
        }

        this.logger.debug(
            `[MessageHandler] Обробка повідомлення типу '${message.type}' від ${userId}`,
        )

        // Приклад перевірки прав доступу
        const canChat = userRoles.includes('user') || userRoles.includes('admin')
        const isAdmin = userRoles.includes('admin')

        try {
            switch (message.type) {
                case 'join':
                    if (message.roomName) {
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
                        // У реальному проекті тут буде виклик методу, який безпечно завершить роботу сервера
                        // process.exit(0); // НЕ ВИКОРИСТОВУВАТИ НА ПРОДАКШНІ БЕЗ ОБЕРЕЖНОСТІ!
                    } else if (message.command === 'sendAlertToAll') {
                        if (message.alertText) {
                            this.logger.info(
                                `[ADMIN] Адмін ${userId} відправляє сповіщення: "${message.alertText}"`,
                            )
                            // Метод broadcastAll (або аналог) може бути доданий до WebSocketManager
                            // Якщо його немає, можна перебрати всіх клієнтів з this.wsManager.clients
                            this.wsManager.wss.clients.forEach((clientWs) => {
                                if (clientWs.readyState === clientWs.OPEN) {
                                    this.wsManager.sendMessage(clientWs, {
                                        type: 'serverAlert',
                                        text: message.alertText,
                                        sender: 'Admin',
                                    })
                                }
                            })
                            this.wsManager.sendMessage(ws, {
                                type: 'commandResult',
                                status: 'success',
                                message: 'Сповіщення надіслано всім.',
                            })
                        } else {
                            this.wsManager.sendError(
                                ws,
                                'adminCommand',
                                "Текст сповіщення обов'язковий.",
                            )
                        }
                    } else {
                        this.wsManager.sendError(
                            ws,
                            'adminCommand',
                            'Невідома команда адміністратора.',
                        )
                    }
                    break

                // Додавайте інші типи повідомлень тут...
                // case 'newCustomType':
                //     // ... ваша нова логіка ...
                //     break;

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
