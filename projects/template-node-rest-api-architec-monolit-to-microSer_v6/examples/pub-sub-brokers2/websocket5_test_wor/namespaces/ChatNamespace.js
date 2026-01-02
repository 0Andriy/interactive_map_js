import { Namespace } from '../core/Namespace.js'

/**
 * Константи подій сокета для забезпечення типізації та уникнення "магічних рядків".
 * Використовується ієрархічна структура: [домен]:[дія].
 */
const SOCKET_EVENTS = {
    // Вхідні події (від клієнта)
    CLIENT_JOIN_ROOM: 'room:join',
    CLIENT_LEAVE_ROOM: 'room:leave',
    CLIENT_SEND_MESSAGE: 'chat:send_message',
    CLIENT_START_TYPING: 'chat:typing_start',
    CLIENT_SEND_GLOBAL: 'chat:send_global',

    // Вихідні події (broadcast/серверні)
    SYSTEM_ERROR: 'sys:error',
    ROOM_USER_JOINED: 'room:user_joined',
    ROOM_USER_LEFT: 'room:user_left',
    ROOM_STATS_UPDATE: 'room:stats_update',
    CHAT_MESSAGE_NEW: 'chat:message_new',
    CHAT_TYPING_INDICATOR: 'chat:typing_indicator',
    CHAT_GLOBAL_ANNOUNCEMENT: 'chat:global_announcement',
}

/**
 * Реєстр стратегій автоматизації кімнат.
 * Дозволяє призначати декілька задач для однієї кімнати з різними налаштуваннями.
 */
const ROOM_AUTOMATION_STRATEGIES = {
    lobby: {
        tasks: [
            {
                id: 'stats',
                intervalMs: 10000,
                runOnActivation: false,
                handler: '_taskBroadcastStats',
            },
        ],
    },
    trading_floor: {
        tasks: [
            {
                id: 'ticker',
                intervalMs: 2000,
                runOnActivation: false,
                handler: '_taskUpdateMarketRates',
            },
            {
                id: 'stats',
                intervalMs: 5000,
                runOnActivation: false,
                handler: '_taskBroadcastStats',
            },
        ],
    },
}

/**
 * ChatNamespace: Реалізація функціоналу чат-кімнат.
 * Забезпечує аутентифікацію, модерацію контенту, захист від спаму та моніторинг активності.
 */
export class ChatNamespace extends Namespace {
    /**
     * Виконує перевірку токена та ідентифікацію користувача при підключенні.
     * @override
     * @param {import('http').IncomingMessage} httpRequest - Об'єкт HTTP-запиту.
     * @returns {Promise<Object|null>} Об'єкт профілю користувача або null, якщо доступ заборонено.
     */
    async authenticate(httpRequest) {
        try {
            // Визначаємо безпеку з'єднання для коректного парсингу URL
            const isTlsEncrypted =
                httpRequest.headers['x-forwarded-proto'] === 'https' || httpRequest.socket.encrypted
            const socketProtocol = isTlsEncrypted ? 'wss' : 'ws'
            const serverHost = httpRequest.headers.host || 'localhost'

            const requestUrl = new URL(httpRequest.url, `${socketProtocol}://${serverHost}`)
            const accessToken = requestUrl.searchParams.get('token')

            if (!accessToken) {
                this.logger?.warn(
                    `[ChatNS] Спроба входу без токена з IP: ${httpRequest.socket.remoteAddress}`,
                )
                return null
            }

            // У реальному проєкті тут викликається сервіс перевірки JWT (напр. jwt.verify)
            // Повертаємо внутрішній об'єкт користувача
            return {
                id: 'u_' + crypto.randomUUID().split('-')[0], // Короткий ID для логів
                displayName: 'Користувач_' + accessToken.slice(0, 3),
                accessLevel: accessToken.includes('admin') ? 'admin' : 'user',
                lastActivityTimestamp: 0,
            }
        } catch (error) {
            this.logger?.error('[ChatNS] Помилка під час аутентифікації:', error)
            return null
        }
    }

    /**
     * Головний диспетчер (обробник) вхідних повідомлень.
     * @override
     * @param {import('./Connection').Connection} connection - Об'єкт поточного з'єднання.
     * @param {string|Buffer} rawPayload - Сирі дані від клієнта.
     */
    async onMessage(connection, rawPayload) {
        try {
            // Парсинг вхідного фрейму
            const incomingFrame = JSON.parse(rawPayload.toString())
            const { type: eventType, room: targetRoomName, payload: messageData } = incomingFrame

            // 1. Валідація базової структури запиту
            if (!eventType) {
                return connection.send({
                    type: SOCKET_EVENTS.SYSTEM_ERROR,
                    payload: 'Невірна структура фрейму (відсутній тип)',
                })
            }

            // 2. Захист від спаму (Rate Limiting на рівні неймспейсу)
            const currentTime = Date.now()
            const timeSinceLastMessage = currentTime - (connection.user?.lastActivityTimestamp || 0)

            if (timeSinceLastMessage < 500) {
                return connection.send({
                    type: SOCKET_EVENTS.SYSTEM_ERROR,
                    room: targetRoomName,
                    payload: 'Занадто часто надсилаються повідомлення (ліміт 500мс)',
                })
            }

            // Оновлюємо мітку часу останньої активності
            if (connection.user) {
                connection.user.lastActivityTimestamp = currentTime
            }

            // 3. Маршрутизація подій
            switch (eventType) {
                case SOCKET_EVENTS.CLIENT_JOIN_ROOM:
                    return await this.processRoomJoin(connection, targetRoomName)

                case SOCKET_EVENTS.CLIENT_LEAVE_ROOM:
                    return await this.processRoomLeave(connection, targetRoomName)

                case SOCKET_EVENTS.CLIENT_SEND_MESSAGE:
                    return await this.processIncomingChatMessage(
                        connection,
                        targetRoomName,
                        messageData?.text,
                    )

                case SOCKET_EVENTS.CLIENT_START_TYPING:
                    return await this.processTypingState(connection, targetRoomName)

                case SOCKET_EVENTS.CLIENT_SEND_GLOBAL:
                    return await this.handleClientGlobalAnnouncement(connection, messageData?.text)

                default:
                    connection.send({
                        type: SOCKET_EVENTS.SYSTEM_ERROR,
                        room: targetRoomName,
                        payload: `Невідомий тип події: ${eventType}`,
                    })
            }
        } catch (error) {
            this.logger?.error('[ChatNS] Помилка обробки повідомлення:', error)
            connection.send({
                type: SOCKET_EVENTS.SYSTEM_ERROR,
                payload: 'Внутрішня помилка обробки повідомлення на сервері',
            })
        }
    }

    /**
     * Обробляє вхід до кімнати та ініціює системні сповіщення.
     * @param {import('./Connection').Connection} connection
     * @param {string} targetRoomName
     */
    async processRoomJoin(connection, targetRoomName) {
        // 1. Технічна валідація формату назви
        if (!this._isValidRoomName(targetRoomName)) {
            return connection.send({
                type: SOCKET_EVENTS.SYSTEM_ERROR,
                payload: 'Некоректний формат назви кімнати',
            })
        }

        // // 1. ПЕРЕВІРКА: Чи існує кімната в глобальному стані (створена через API)
        // // Використовуємо метод roomExists, який звертається до Redis
        // const isRoomRegistered = await this.state.roomExists(this.name, targetRoomName)

        // if (!isRoomRegistered) {
        //     this.logger?.warn(`[Security] Спроба входу в неіснуючу кімнату: ${targetRoomName}`)
        //     return connection.send({
        //         type: SOCKET_EVENTS.SYSTEM_ERROR,
        //         payload: 'Кімната не існує. Створіть її через особистий кабінет.',
        //     })
        // }

        // // 2. Перевірка дозволів (ACL)
        // const isAllowed = await this._isAccessAllowed(connection, targetRoomName)

        // if (!isAllowed) {
        //     this.logger?.warn(
        //         `[Security] Відхилено спробу входу в ${targetRoomName} від ${connection.user?.id}`,
        //     )
        //     return connection.send({
        //         type: SOCKET_EVENTS.SYSTEM_ERROR,
        //         room: targetRoomName,
        //         payload: 'У вас немає доступу до цієї кімнати або вона не існує',
        //     })
        // }

        const targetRoom = this.room(targetRoomName)
        await targetRoom.join(connection.id)

        const authorProfile = this._buildAuthorProfile(connection)

        await targetRoom.emit({
            type: SOCKET_EVENTS.ROOM_USER_JOINED,
            sender: authorProfile,
            payload: { message: `${authorProfile.name} приєднався до чату` },
        })

        // Запуск статистики при першому підключенні
        const participants = await this.state.getClientsInRoom(this.name, targetRoomName)
        if (participants.length === 1) {
            await this.toggleRoomAutomation(targetRoomName, 'START')
        }
    }

    /**
     * Обробляє вихід з кімнати.
     * @param {import('./Connection').Connection} connection
     * @param {string} targetRoomName
     */
    async processRoomLeave(connection, targetRoomName) {
        const targetRoom = this.room(targetRoomName)
        await targetRoom.leave(connection.id)

        const authorProfile = this._buildAuthorProfile(connection)

        await targetRoom.emit({
            type: SOCKET_EVENTS.ROOM_USER_LEFT,
            sender: authorProfile,
            payload: { message: `${authorProfile.name} залишив чат` },
        })

        // Зупинка статистики, якщо кімната порожня
        const participants = await this.state.getClientsInRoom(this.name, targetRoomName)
        if (participants.length === 0) {
            await this.toggleRoomAutomation(targetRoomName, 'STOP')
        }
    }

    /**
     * Валідує, санітизує та розсилає чат-повідомлення.
     * @param {import('./Connection').Connection} connection
     * @param {string} targetRoomName
     * @param {string} textContent
     */
    async processIncomingChatMessage(connection, targetRoomName, textContent) {
        if (!this._isContentValid(textContent)) return

        // Перевірка прав (чи користувач у кімнаті)
        const isAuthorized = await this.state.isMember(this.name, targetRoomName, connection.id)
        if (!isAuthorized) {
            return connection.send({
                type: SOCKET_EVENTS.SYSTEM_ERROR,
                room: targetRoomName,
                payload: 'Доступ заборонено',
            })
        }

        // Базовий захист від XSS
        const sanitizedText = textContent.replace(/<\/?[^>]+(>|$)/g, '').trim()

        await this.room(targetRoomName).emit({
            type: SOCKET_EVENTS.CHAT_MESSAGE_NEW,
            sender: this._buildAuthorProfile(connection),
            payload: { text: sanitizedText },
        })
    }

    /**
     * Надсилає індикатор набору тексту учасникам кімнати.
     * @param {import('./Connection').Connection} connection
     * @param {string} targetRoomName
     */
    async processTypingState(connection, targetRoomName) {
        await this.room(targetRoomName).emit({
            type: SOCKET_EVENTS.CHAT_TYPING_INDICATOR,
            sender: { id: connection.user?.id, name: connection.user?.displayName },
            exceptId: connection.id, // Не шлемо самому собі
        })
    }

    /**
     * Обробляє запит адміністратора на глобальну розсилку по всьому неймспейсу.
     * @param {import('./Connection').Connection} connection
     * @param {string} textContent
     */
    async handleClientGlobalAnnouncement(connection, textContent) {
        // Перевірка прав доступу
        if (connection.user?.accessLevel !== 'admin') {
            this.logger?.warn(`[ChatNS] Спроба несанкціонованої розсилки від: ${connection.id}`)
            return connection.send({
                type: SOCKET_EVENTS.SYSTEM_ERROR,
                payload: 'Недостатньо прав для глобальних оголошень',
            })
        }

        if (!this._isContentValid(textContent)) return

        await this.broadcastToAll(textContent, connection.user)
    }

    /**
     * Надсилає важливе оголошення ВСІМ користувачам неймспейсу /chat (весь кластер).
     * @param {string} messageText - Текст оголошення.
     * @param {Object|null} [adminUser] - Об'єкт адміністратора.
     */
    async broadcastToAll(messageText, adminUser = null) {
        this.logger?.info(`[ChatNS] Глобальна розсилка: ${messageText}`)

        await this.broadcast(
            SOCKET_EVENTS.CHAT_GLOBAL_ANNOUNCEMENT,
            { text: messageText, isGlobal: true },
            adminUser ? { id: adminUser.id, name: adminUser.name, rank: 'admin' } : null,
        )
    }

    /** @private */
    _isContentValid(text) {
        return text && typeof text === 'string' && text.trim().length > 0 && text.length <= 1000
    }

    /** @private */
    _buildAuthorProfile(connection) {
        return {
            id: connection.user?.id || connection.id,
            name: connection.user?.displayName || `Guest_${connection.id.slice(0, 5)}`,
            rank: connection.user?.accessLevel || 'guest',
        }
    }

    /**
     * Валідація назви кімнати перед створенням/приєднанням.
     * @param {string} roomName
     * @returns {boolean}
     * @private
     */
    _isValidRoomName(roomName) {
        // Регулярний вираз: лише латиниця, цифри, дефіс та підкреслення
        const roomPattern = /^[a-z0-9_-]{3,64}$/
        return roomPattern.test(roomName)
    }

    /**
     * Внутрішня логіка перевірки прав доступу.
     * @param {import('./Connection').Connection} connection
     * @param {string} roomName
     * @returns {Promise<boolean>}
     * @private
     */
    async _isAccessAllowed(connection, roomName) {
        // ПРАВИЛО 1: Адміністратори мають доступ всюди
        if (connection.user?.accessLevel === 'admin') return true

        // ПРАВИЛО 2: Публічні кімнати доступні всім
        const publicRooms = ['lobby', 'news', 'general']
        if (publicRooms.includes(roomName)) return true

        // ПРАВИЛО 3: Кімнати за шаблоном (наприклад, тільки для читання)
        if (roomName.startsWith('public_')) return true

        // ПРАВИЛО 4: Приватні кімнати (динамічна перевірка)
        // Приклад: кімната 'private:123', де 123 - ID користувача
        if (roomName === `private:${connection.user?.id}`) return true

        // ПРАВИЛО 5: Перевірка через зовнішній сервіс або БД
        // Наприклад, перевірка, чи є користувач учасником групи
        // const isMember = await this.db.checkMembership(connection.user.id, roomName);
        // return isMember;

        return false // По замовчуванню доступ заборонено (Zero Trust)
    }

    /**
     * Керує життєвим циклом автоматизованих задач кімнати.
     * @param {string} roomName - Назва кімнати.
     * @param {'START'|'STOP'} action - Дія (запуск/зупинка).
     * @private
     */
    async toggleRoomAutomation(roomName, action) {
        const strategy = ROOM_AUTOMATION_STRATEGIES[roomName]
        if (!strategy || !strategy.tasks) return

        for (const task of strategy.tasks) {
            const taskId = `job:${this.name}:${roomName}:${task.id}`

            if (action === 'START') {
                await this.scheduler?.schedule(
                    taskId,
                    async () => {
                        // Перевірка активності перед виконанням (Double-check)
                        const clients = await this.state.getClientsInRoom(this.name, roomName)
                        if (clients.length === 0) return await this.scheduler.stop(taskId)

                        // Динамічний виклик обробника
                        if (typeof this[task.handler] === 'function') {
                            await this[task.handler](roomName)
                        }
                    },
                    {
                        intervalMs: task.intervalMs,
                        runOnActivation: task.runOnActivation,
                    },
                )
            } else {
                await this.scheduler?.stop(taskId)
            }
        }
    }

    // --- ОБРОБНИКИ ЗАДАЧ (HANDLERS) ---

    /** @private */
    async _taskBroadcastStats(roomName) {
        const clients = await this.state.getClientsInRoom(this.name, roomName)
        await this.room(roomName).emit({
            type: SOCKET_EVENTS.ROOM_STATS_UPDATE,
            payload: { onlineCount: clients.length },
        })
    }

    /** @private */
    async _taskUpdateMarketRates(roomName) {
        const rate = (95000 + Math.random() * 500).toFixed(2)
        await this.room(roomName).emit({
            type: 'market:ticker_update',
            payload: { symbol: 'BTC/USD', price: rate },
        })
    }

    /** @private */
    async _taskCleanupGhostSessions(roomName) {
        this.logger?.debug(`[Maintenance] Очищення кімнати ${roomName}`)
        // Логіка перевірки застарілих стейтів у Redis
    }
}
