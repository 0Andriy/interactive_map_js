import { Room } from './Room.js'
import { TaskScheduler } from './TaskScheduler.js'
import { ILogger } from '../interfaces/ILogger.js'
import { IPubSub } from '../interfaces/IPubSub.js'
import { IStorage } from '../interfaces/IStorage.js'
import { WsAdapter } from '../adapters/WsAdapter.js' // Зберігається
import { LeaderElection } from '../services/LeaderElection.js' // Новий імпорт

/**
 * @class Namespace
 * @description Представляє простір імен, що містить кімнати та глобальні задачі.
 */
class Namespace {
    #id
    #rooms = new Map() // Map<roomId, Room> - локальний кеш для об'єктів Room
    #globalTaskScheduler
    #logger
    #roomConfigDefaults
    #wsAdapter
    #pubSub
    #storage
    #leaderElection

    // Ключі для сховища
    #NAMESPACE_ROOMS_KEY = 'namespace_rooms:' // namespace_rooms:{namespaceId} (для списку ID кімнат)

    /**
     * @param {string} id - Унікальний ідентифікатор простору імен (наприклад, "chat", "game").
     * @param {ILogger} logger - Екземпляр логера.
     * @param {object} [roomConfigDefaults={}] - Дефолтні конфігурації для кімнат в цьому просторі імен.
     * @param {WsAdapter} wsAdapter - Екземпляр WebSocket адаптера.
     * @param {IPubSub} pubSub - Екземпляр Pub/Sub для міжінстансної комунікації.
     * @param {IStorage} storage - Екземпляр сховища для стану.
     * @param {LeaderElection} [leaderElection=null] - Екземпляр LeaderElection (опціонально).
     */
    constructor(
        id,
        logger,
        roomConfigDefaults = {},
        wsAdapter,
        pubSub,
        storage,
        leaderElection = null,
    ) {
        this.#id = id
        this.#logger = logger
        this.#globalTaskScheduler = new TaskScheduler(logger)
        this.#roomConfigDefaults = roomConfigDefaults
        this.#wsAdapter = wsAdapter
        this.#pubSub = pubSub
        this.#storage = storage

        this.#leaderElection = leaderElection
        this.#logger.log(
            `Namespace '${this.#id}' created.${
                this.#leaderElection ? ' Leader Election enabled.' : ''
            }`,
        )

        this.#logger.log(`Namespace '${this.#id}' created.`)
        this.#setupPubSubListeners()
        this.#loadRoomsFromStorage() // Завантажуємо кімнати при старті
    }

    get id() {
        return this.#id
    }

    /**
     * Завантажує ID кімнат, які існують в цьому просторі імен, зі сховища.
     * Потім створює об'єкти Room для них.
     */
    async #loadRoomsFromStorage() {
        // У розподіленому режимі, Rooms можуть бути створені на інших інстансах.
        // Ми можемо отримати список їх ID зі сховища.
        const roomIds = await this.#storage.listKeys(`room_users:${this.#id}:*`)
        for (const key of roomIds) {
            // Приклад ключа: room_users:chat:general. Витягуємо "general"
            const roomId = key.split(':')[2]
            if (roomId) {
                // Створюємо об'єкт Room, але без додавання користувачів
                // Користувачі будуть завантажені Room з її власного ключа Set в Storage
                // Важливо: getOrCreateRoom вже враховує, чи Room існує
                await this.getOrCreateRoom(roomId)
            }
        }
        this.#logger.log(`Namespace '${this.#id}': Loaded ${roomIds.length} room IDs from storage.`)
    }

    #setupPubSubListeners() {
        const namespaceChannel = `namespace:${this.#id}`
        this.#pubSub.subscribe(namespaceChannel, (channel, data) => {
            this.#logger.debug(`Received Pub/Sub message for namespace '${this.#id}':`, data)
            // Обробка міжсерверних повідомлень
            switch (data.type) {
                case 'roomMessageBroadcast':
                    const room = this.getRoom(data.roomId)
                    if (room) {
                        // Відправляємо повідомлення локальним користувачам цієї кімнати
                        // (які знаходяться на поточному інстансі)
                        // Фільтруємо, щоб не відправляти назад відправнику, якщо він на цьому ж інстансі
                        room.getUsers().then((users) => {
                            const usersToSendTo = users.filter((id) => id !== data.from)
                            this.#wsAdapter.broadcastToUsers(usersToSendTo, {
                                type: 'roomData',
                                roomId: data.roomId,
                                from: data.from,
                                payload: data.payload,
                            })
                        })
                    }
                    break
                case 'roomCreated':
                    // Якщо кімната створена на іншому інстансі, створюємо її локальний об'єкт
                    this.#logger.log(
                        `Namespace '${this.#id}': Room '${
                            data.roomId
                        }' created on another instance.`,
                    )
                    this.getOrCreateRoom(data.roomId) // Створить, якщо ще немає
                    break
                case 'roomRemoved':
                    // Якщо кімната видалена на іншому інстансі, видаляємо її локальний об'єкт
                    this.#logger.log(
                        `Namespace '${this.#id}': Room '${
                            data.roomId
                        }' removed on another instance.`,
                    )
                    if (this.#rooms.has(data.roomId)) {
                        this.#rooms.get(data.roomId).destroy() // Очистити локальні ресурси
                        this.#rooms.delete(data.roomId)
                    }
                    break
                // ... інші типи подій (користувач приєднався/покинув кімнату на іншому інстансі тощо)
            }
        })
    }

    /**
     * Створює або повертає існуючу кімнату.
     * @param {string} roomId - Ідентифікатор кімнати.
     * @param {object} [config={}] - Додаткова конфігурація для кімнати.
     * @returns {Room}
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
                async (roomIdToRemove) => this.removeRoom(roomIdToRemove), // Callback для видалення
            )
            this.#rooms.set(roomId, room)
            this.#logger.log(`Room '${roomId}' created in namespace '${this.#id}'.`)

            // Публікуємо подію про створення кімнати, щоб інші інстанси знали
            if (this.#pubSub) {
                await this.#pubSub.publish(`namespace:${this.#id}`, {
                    type: 'roomCreated',
                    namespaceId: this.#id,
                    roomId: roomId,
                })
            }
        }
        return this.#rooms.get(roomId)
    }

    /**
     * Отримує кімнату за її ID.
     * @param {string} roomId - Ідентифікатор кімнати.
     * @returns {Room|undefined}
     */
    getRoom(roomId) {
        return this.#rooms.get(roomId)
    }

    /**
     * Видаляє кімнату.
     * @param {string} roomId - Ідентифікатор кімнати.
     * @returns {Promise<boolean>} True, якщо кімната була видалена.
     */
    async removeRoom(roomId) {
        const room = this.#rooms.get(roomId)
        if (room) {
            await room.destroy() // Очистити локальні ресурси та зі сховища
            this.#rooms.delete(roomId)
            this.#logger.log(`Room '${roomId}' removed from namespace '${this.#id}'.`)

            // Публікуємо подію про видалення кімнати
            if (this.#pubSub) {
                await this.#pubSub.publish(`namespace:${this.#id}`, {
                    type: 'roomRemoved',
                    namespaceId: this.#id,
                    roomId: roomId,
                })
            }
            return true
        }
        return false
    }

    // /**
    //  * Реєструє глобальну періодичну задачу для цього простору імен.
    //  * Ці задачі працюють незалежно від кількості користувачів у кімнатах,
    //  * але можуть мати власну логіку перевірки.
    //  * @param {string} taskId - Унікальний ідентифікатор задачі.
    //  * @param {object} config - Конфігурація задачі (intervalMs, runOnActivation).
    //  * @param {function(any): any} taskFn - Функція, яка буде виконуватися.
    //  * @param {object} [params={}] - Параметри для taskFn.
    //  */
    // addGlobalScheduledTask(taskId, config, taskFn, params = {}) {
    //     const uniqueTaskId = `global_${this.#id}_${taskId}`
    //     // Передаємо сам простір імен, wsAdapter та storage як параметри для задачі
    //     const taskParams = {
    //         ...params,
    //         namespace: this,
    //         wsAdapter: this.#wsAdapter,
    //         storage: this.#storage,
    //     }
    //     this.#globalTaskScheduler.scheduleTask(uniqueTaskId, config, taskFn, taskParams)
    //     this.#logger.log(`Global task '${taskId}' scheduled for namespace '${this.#id}'.`)
    // }

    /**
     * Реєструє глобальну періодичну задачу для цього простору імен.
     * @param {string} taskId - Унікальний ідентифікатор задачі.
     * @param {object} config - Конфігурація задачі (intervalMs, runOnActivation).
     * @param {boolean} [config.runOnlyOnLeader=false] - Чи запускати задачу тільки на інстансі-лідері.
     * @param {function(any): any} taskFn - Функція, яка буде виконуватися.
     * @param {object} [params={}] - Параметри для taskFn.
     */
    addGlobalScheduledTask(taskId, config, taskFn, params = {}) {
        const uniqueTaskId = `global_${this.#id}_${taskId}`
        const originalTaskFn = taskFn // Зберігаємо оригінальну функцію

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
            return await originalTaskFn(taskParams)
        }

        const taskParams = {
            ...params,
            namespace: this,
            wsAdapter: this.#wsAdapter,
            storage: this.#storage,
            leaderElection: this.#leaderElection, // Передаємо LeaderElection в params
        }

        this.#globalTaskScheduler.scheduleTask(uniqueTaskId, config, wrappedTaskFn, taskParams)
        this.#logger.log(
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
        const uniqueTaskId = `global_${this.#id}_${taskId}`
        this.#globalTaskScheduler.stopTask(uniqueTaskId)
    }

    /**
     * Публікує повідомлення в канал Pub/Sub для кімнати, а також локально розсилає його.
     * Це центральна точка для відправки повідомлень у кімнату.
     * @param {string} roomId - ID кімнати.
     * @param {string} userId - ID користувача, який відправив повідомлення (або джерело).
     * @param {any} payload - Вміст повідомлення.
     */
    async publishRoomMessage(roomId, userId, payload) {
        const message = {
            type: 'roomMessageBroadcast',
            namespaceId: this.#id,
            roomId: roomId,
            from: userId,
            payload: payload,
        }
        // Публікуємо в Pub/Sub, щоб інші інстанси отримали
        if (this.#pubSub) {
            await this.#pubSub.publish(`namespace:${this.#id}`, message)
        }

        // Локально відправляємо також, щоб користувачі на цьому інстансі отримали без затримки
        const room = this.getRoom(roomId)
        if (room) {
            const users = await room.getUsers()
            const usersToSendTo = users.filter((id) => id !== userId)
            this.#wsAdapter.broadcastToUsers(usersToSendTo, {
                type: 'roomData',
                roomId: roomId,
                from: userId,
                payload: payload,
            })
        }
    }

    /**
     * Очищає всі ресурси простору імен (зупиняє задачі, видаляє кімнати).
     */
    async destroy() {
        this.#globalTaskScheduler.stopAllTasks()
        // Спочатку відписуємося від Pub/Sub, щоб не отримувати зайвих повідомлень
        if (this.#pubSub) {
            await this.#pubSub.unsubscribe(`namespace:${this.#id}`, this.#setupPubSubListeners) // Потрібно зберігати посилання на listener
        }

        // Тепер видаляємо всі кімнати
        const roomDestroyPromises = Array.from(this.#rooms.values()).map((room) => room.destroy())
        await Promise.all(roomDestroyPromises)
        this.#rooms.clear()

        this.#logger.log(`Namespace '${this.#id}' destroyed.`)
    }
}

export { Namespace }
