/**
 * @file Namespace.js
 * @description Реалізує простір імен для управління кімнатами, клієнтами та глобальними задачами
 * у розподіленій системі.
 */

import { Room } from './Room.js'
import { TaskScheduler } from './TaskScheduler.js'
import { IPubSub } from '../pub_sub/IPubSub.js'
import { IStorage } from '../storage/IStorage.js'
import { WsAdapter } from '../WsAdapter.js'
import { LeaderElection } from '../LeaderElection.js'

/**
 * @class Namespace
 * @description Представляє простір імен, що містить кімнати та глобальні задачі.
 * Відповідає за життєвий цикл кімнат, їх локальне кешування та міжінстансну комунікацію.
 *
 * @property {string} #id - Унікальний ідентифікатор простору імен.
 * @property {Map<string, Room>} #rooms - Локальний кеш для об'єктів Room.
 * @property {TaskScheduler} #globalTaskScheduler - Планувальник для глобальних задач простору імен.
 * @property {ILogger} #logger - Екземпляр логера.
 * @property {object} #roomConfigDefaults - Дефолтна конфігурація для кімнат.
 * @property {WsAdapter} #wsAdapter - Екземпляр WebSocket адаптера.
 * @property {IPubSub} #pubSub - Екземпляр Pub/Sub для міжінстансної комунікації.
 * @property {IStorage} #storage - Екземпляр сховища для стану.
 * @property {LeaderElection|null} #leaderElection - Екземпляр LeaderElection.
 * @property {Function} #pubSubListener - Приватне посилання на функцію зворотного виклику для відписки.
 * @property {string} #namespaceChannel - Назва каналу Pub/Sub для цього простору імен.
 * @property {string} #ROOMS_SET_KEY - Ключ для сховища, що містить ID всіх кімнат.
 */
class Namespace {
    #id
    #rooms = new Map()
    #globalTaskScheduler
    #logger
    #roomConfigDefaults
    #wsAdapter
    #pubSub
    #storage
    #leaderElection
    #pubSubListener
    #namespaceChannel
    #handlers
    #defaultHandlers
    #ROOMS_SET_KEY

    /**
     * @constructor
     * @param {string} id - Унікальний ідентифікатор простору імен (наприклад, "chat", "game").
     * @param {object} handlers - Об'єкт, що містить обробники подій.
     * @param {Function} [handlers.onConnect] - Обробник, що викликається при підключенні користувача.
     * @param {Function} [handlers.onMessage] - Обробник для вхідних повідомлень.
     * @param {Function} [handlers.onDisconnect] - Обробник, що викликається при відключенні користувача.
     * @param {ILogger} logger - Екземпляр логера.
     * @param {object} [roomConfigDefaults={}] - Дефолтні конфігурації для кімнат в цьому просторі імен.
     * @param {WsAdapter} wsAdapter - Екземпляр WebSocket адаптера.
     * @param {IPubSub} pubSub - Екземпляр Pub/Sub для міжінстансної комунікації.
     * @param {IStorage} storage - Екземпляр сховища для стану.
     * @param {LeaderElection} [leaderElection=null] - Екземпляр LeaderElection (опціонально).
     */
    constructor(
        id,
        handlers,
        logger,
        roomConfigDefaults = {},
        wsAdapter,
        pubSub,
        storage,
        leaderElection = null,
    ) {
        this.#id = id
        this.#handlers = handlers || {}
        this.#logger = logger
        this.#globalTaskScheduler = new TaskScheduler(logger)
        this.#roomConfigDefaults = roomConfigDefaults
        this.#wsAdapter = wsAdapter
        this.#pubSub = pubSub
        this.#storage = storage
        this.#leaderElection = leaderElection
        this.#namespaceChannel = `namespace:${this.#id}`
        this.#ROOMS_SET_KEY = `namespace_rooms:${this.#id}`

        this.#defaultHandlers = this.#createDefaultHandlers()

        this.#logger.info(
            `Namespace '${this.#id}' created.${
                this.#leaderElection ? ' Leader Election enabled.' : ''
            }`,
        )
        this.#pubSubListener = this.#setupPubSubListeners.bind(this)
        this.#pubSub.subscribe(this.#namespaceChannel, this.#pubSubListener)
        this.#loadRoomsFromStorage()
    }

    /**
     * Повертає ідентифікатор простору імен.
     * @returns {string}
     */
    get id() {
        return this.#id
    }

    /**
     * Повертає мапу всіх локально кешованих кімнат.
     * @returns {Map<string, Room>}
     */
    getAllRooms() {
        return this.#rooms
    }

    /**
     * Отримує кімнату за її ID з локального кешу.
     * @param {string} roomId - Ідентифікатор кімнати.
     * @returns {Room|undefined}
     */
    getRoom(roomId) {
        return this.#rooms.get(roomId)
    }

    /**
     * Створює або повертає існуючу кімнату.
     * Якщо кімната не існує в локальному кеші, створює новий об'єкт та публікує подію
     * про створення для інших інстансів.
     * @async
     * @param {string} roomId - Ідентифікатор кімнати.
     * @param {object} [config={}] - Додаткова конфігурація для кімнати.
     * @returns {Promise<Room>}
     */
    async getOrCreateRoom(roomId, config = {}) {
        if (!this.#rooms.has(roomId)) {
            const room = new Room(
                roomId,
                this.#id,
                { ...this.#roomConfigDefaults, ...config },
                this.#logger,
                this.#globalTaskScheduler,
                this.#wsAdapter,
                this.#storage,
                async (roomIdToRemove) => this.removeRoom(roomIdToRemove),
                this.#leaderElection,
            )
            this.#rooms.set(roomId, room)
            this.#logger.info(`Room '${roomId}' created in namespace '${this.#id}'.`)

            await this.#_publishNamespaceEvent('roomCreated', { roomId })
        }
        return this.#rooms.get(roomId)
    }

    /**
     * Видаляє кімнату з локального кешу та ініціює її знищення.
     * Публікує подію про видалення для інших інстансів.
     * @async
     * @param {string} roomId - Ідентифікатор кімнати.
     * @returns {Promise<boolean>} True, якщо кімната була видалена.
     */
    async removeRoom(roomId) {
        const room = this.#rooms.get(roomId)
        if (room) {
            await room.destroy()
            this.#rooms.delete(roomId)
            this.#logger.info(`Room '${roomId}' removed from namespace '${this.#id}'.`)

            await this.#_publishNamespaceEvent('roomRemoved', { roomId })
            return true
        }
        return false
    }

    /**
     * Надсилає повідомлення всім унікальним користувачам у просторі імен.
     * Цей метод не перебирає користувачів локально. Замість цього він
     * публікує подію у Pub/Sub, яку отримає кожен інстанс, і вже там
     * відбувається розсилка на локально підключених користувачів.
     * @param {string} type - Тип повідомлення.
     * @param {object} payload - Корисне навантаження повідомлення.
     * @param {object} options - Опції для надсилання повідомлення.
     * @param {string[]} [options.excludeUsers=[]] - Масив ID користувачів, яким не слід надсилати повідомлення.
     */
    async broadcast(type, payload, options = {}) {
        this.#logger.debug(`Broadcasting message '${type}' to namespace '${this.#id}' via Pub/Sub.`)
        // Публікуємо подію у спеціальний канал для широкомовної розсилки.
        // Далі її обробить слухач на кожному інстансі.
        await this.#pubSub.publish(this.#namespaceChannel + ':broadcast', {
            type,
            payload,
            options,
        })
    }

    /**
     * Допоміжний метод для публікації подій простору імен у Pub/Sub.
     * @private
     * @async
     * @param {string} type - Тип події.
     * @param {object} payload - Корисне навантаження події.
     */
    async #_publishNamespaceEvent(type, payload) {
        if (this.#pubSub) {
            await this.#pubSub.publish(this.#namespaceChannel, {
                type,
                namespaceId: this.#id,
                ...payload,
            })
        }
    }

    /**
     * Завантажує ID кімнат, які існують у сховищі, та створює їх локальні об'єкти.
     * Використовується при старті сервера для синхронізації стану.
     * @private
     * @async
     */
    async #loadRoomsFromStorage() {
        const roomIds = await this.#storage.getSetMembers(this.#ROOMS_SET_KEY)
        for (const roomId of roomIds) {
            await this.getOrCreateRoom(roomId)
        }
        this.#logger.info(
            `Namespace '${this.#id}': Loaded ${roomIds.length} room IDs from storage.`,
        )
    }

    /**
     * Встановлює слухача для міжінстансних повідомлень Pub/Sub.
     * @private
     * @param {string} channel - Назва каналу, на який прийшло повідомлення.
     * @param {object} data - Дані повідомлення.
     */
    #setupPubSubListeners(channel, data) {
        this.#logger.debug(`Received Pub/Sub message for namespace '${this.#id}':`, data)
        switch (data.type) {
            case 'roomCreated':
                this.#logger.info(
                    `Namespace '${this.#id}': Room '${data.roomId}' created on another instance.`,
                )
                this.getOrCreateRoom(data.roomId)
                break
            case 'roomRemoved':
                this.#logger.info(
                    `Namespace '${this.#id}': Room '${data.roomId}' removed on another instance.`,
                )
                if (this.#rooms.has(data.roomId)) {
                    this.#rooms.get(data.roomId).destroy()
                    this.#rooms.delete(data.roomId)
                }
                break
        }
    }

    /**
     * Реєструє глобальну періодичну задачу для цього простору імен.
     * @param {string} taskId - Унікальний ідентифікатор задачі.
     * @param {object} config - Конфігурація задачі.
     * @param {boolean} [config.runOnlyOnLeader=false] - Чи запускати задачу тільки на інстансі-лідері.
     * @param {Function} taskFn - Функція, яка буде виконуватися.
     * @param {object} [params={}] - Параметри для taskFn.
     */
    addGlobalScheduledTask(taskId, config, taskFn, params = {}) {
        const uniqueTaskId = `${this.#namespaceChannel}:${taskId}`

        const wrappedTaskFn = async (taskParams) => {
            if (config.runOnlyOnLeader) {
                if (!this.#leaderElection || !this.#leaderElection.isLeader()) {
                    this.#logger.debug(
                        `Task '${taskId}' skipped: not the leader or LeaderElection not configured.`,
                    )
                    return { status: 'skipped_not_leader' }
                }
                this.#logger.debug(`Task '${taskId}' running as leader.`)
            }
            return await taskFn(taskParams)
        }

        const taskParams = {
            ...params,
            namespace: this,
            wsAdapter: this.#wsAdapter,
            storage: this.#storage,
            leaderElection: this.#leaderElection,
        }

        this.#globalTaskScheduler.scheduleTask(uniqueTaskId, wrappedTaskFn, config, taskParams)
        this.#logger.info(
            `Global task '${taskId}' scheduled for namespace '${
                this.#id
            }'. Run only on leader: ${!!config.runOnlyOnLeader}.`,
        )
    }

    /**
     * Зупиняє глобальну періодичну задачу.
     * @param {string} taskId - Ідентифікатор задачі.
     */
    stopGlobalScheduledTask(taskId) {
        const uniqueTaskId = `${this.#namespaceChannel}:${taskId}`
        this.#globalTaskScheduler.stopTask(uniqueTaskId)
    }

    /**
     * Очищає всі ресурси простору імен (зупиняє задачі, видаляє кімнати).
     * @async
     */
    async destroy() {
        this.#globalTaskScheduler.stopAllTasks()
        if (this.#pubSub) {
            await this.#pubSub.unsubscribe(this.#namespaceChannel, this.#pubSubListener)
        }

        const roomDestroyPromises = Array.from(this.#rooms.values()).map((room) => room.destroy())
        await Promise.all(roomDestroyPromises)
        this.#rooms.clear()

        this.#logger.info(`Namespace '${this.#id}' destroyed.`)
    }

    /**
     * @private
     * @returns {object} Об'єкт з дефолтними обробниками.
     */
    #createDefaultHandlers() {
        return {
            onConnect: async (namespace, userId) => {
                this.#logger.debug(`Default onConnect handler called for user '${userId}'.`)
            },
            onMessage: async (namespace, userId, message) => {
                switch (message.type) {
                    case 'joinRoom': {
                        const roomToJoin = await this.getOrCreateRoom(message.roomId)
                        const added = await roomToJoin.addUser(userId)
                        if (added) {
                            await roomToJoin.send('roomJoined', {
                                roomId: message.roomId,
                                namespaceId: this.#id,
                            })

                            await roomToJoin.send(
                                'userJoined',
                                {
                                    userId: userId,
                                },
                                {},
                                [userId],
                            )
                        }

                        return true
                    }
                    case 'leaveRoom': {
                        const roomToLeave = this.getRoom(message.roomId)
                        if (roomToLeave) {
                            const removed = await roomToLeave.removeUser(userId)
                            if (removed) {
                                await roomToLeave.send('roomLeft', {
                                    roomId: message.roomId,
                                    namespaceId: this.#id,
                                })

                                await roomToLeave.send(
                                    'userLeft',
                                    {
                                        userId: userId,
                                    },
                                    {},
                                    [userId],
                                )
                            }
                        }

                        return true
                    }
                    case 'roomMessage': {
                        const targetRoom = this.getRoom(message.roomId)
                        if (targetRoom && (await targetRoom.hasUser(userId))) {
                            await targetRoom.send('roomMessage', message.payload)
                        } else {
                            this.#logger.warn(
                                `User '${userId}' tried to send message to non-existent or unauthorized room '${
                                    message.roomId
                                }' in namespace '${this.#id}'.`,
                            )
                        }

                        return true
                    }
                    default:
                        return false
                }
            },
            onDisconnect: async (namespace, userId) => {
                const rooms = namespace.getAllRooms()
                for (const room of rooms.values()) {
                    if (await room.hasUser(userId)) {
                        await room.removeUser(userId)
                    }
                }
                this.#logger.info(
                    `User '${userId}' disconnected and was removed from all rooms in namespace '${namespace.id}'.`,
                )
            },
        }
    }

    /**
     * @async
     * @param {string} userId - ID користувача, що підключився.
     */
    async handleClientConnect(userId) {
        await this.#defaultHandlers.onConnect(this, userId)
        if (this.#handlers.onConnect) {
            this.#logger.debug(`Calling custom onConnect handler for user '${userId}'.`)
            await this.#handlers.onConnect(this, userId)
        }
    }

    /**
     * @async
     * @param {string} userId - Ідентифікатор користувача.
     * @param {object} message - Вхідне повідомлення від клієнта.
     */
    async handleClientMessage(userId, message) {
        this.#logger.debug(
            `Namespace '${this.#id}': Handling client message from '${userId}':`,
            message,
        )
        let defaultHandled = await this.#defaultHandlers.onMessage(this, userId, message)
        if (this.#handlers.onMessage) {
            await this.#handlers.onMessage(this, userId, message, defaultHandled)
        }
    }

    /**
     * @async
     * @param {string} userId - ID користувача, що відключився.
     */
    async handleClientDisconnect(userId) {
        this.#logger.debug(
            `Handling client disconnect for user '${userId}' in namespace '${this.#id}'.`,
        )
        await this.#defaultHandlers.onDisconnect(this, userId)
        if (this.#handlers.onDisconnect) {
            await this.#handlers.onDisconnect(this, userId)
        }
    }
}

export { Namespace }
