// src/storage/InMemoryStateStorage.js

import { IStateStorage } from './IStateStorage.js'

/**
 * Реалізація сховища стану In-Memory для монолітної архітектури.
 * Імітує асинхронні операції та Pub/Sub.
 * @implements {IStateStorage}
 */
class InMemoryStateStorage extends IStateStorage {
    constructor(logger = console) {
        super(logger)
        /** @type {Map<string, import('../core/definitions').ClientInfo>} */
        this.allClients = new Map() // Map<clientId, clientInfo>
        /** @type {Map<string, Set<string>>} */
        this.usersClients = new Map() // Map<userId, Set<clientId>>
        /** @type {Map<string, { info: import('../core/definitions').NamespaceInfo, rooms: Map<string, { info: import('../core/definitions').RoomInfo, clients: Set<string> }> }>} */
        this.namespaces = new Map() // Map<namespacePath, { info: {}, rooms: Map<roomId, { info: {}, clients: Set<clientId> }> }>

        // Імітація Pub/Sub
        /** @type {Map<string, Set<Function>>} */
        this.pubSubChannels = new Map() // Map<channelName, Set<callback>>
        this.logger.info('InMemoryStateStorage ініціалізовано.')
    }

    // --- Клієнти ---
    async addClient(clientInfo) {
        this.allClients.set(clientInfo.id, clientInfo)
        if (!this.usersClients.has(clientInfo.userId)) {
            this.usersClients.set(clientInfo.userId, new Set())
        }
        this.usersClients.get(clientInfo.userId).add(clientInfo.id)
        this.logger.debug(`[InMemory] Клієнт ${clientInfo.id} додано.`)
        return Promise.resolve(true)
    }

    async getClient(clientId) {
        this.logger.debug(`[InMemory] Отримання клієнта ${clientId}.`)
        return Promise.resolve(this.allClients.get(clientId))
    }

    async removeClient(clientId) {
        const clientInfo = this.allClients.get(clientId)
        if (clientInfo) {
            this.allClients.delete(clientId)
            if (this.usersClients.has(clientInfo.userId)) {
                this.usersClients.get(clientInfo.userId).delete(clientId)
                if (this.usersClients.get(clientInfo.userId).size === 0) {
                    this.usersClients.delete(clientInfo.userId)
                }
            }
            // Видалити клієнта з усіх кімнат, де він був (для цілісності)
            this.namespaces.forEach((ns) => {
                ns.rooms.forEach((room) => {
                    room.clients.delete(clientId)
                })
            })
            this.logger.debug(`[InMemory] Клієнт ${clientId} видалено.`)
            return Promise.resolve(true)
        }
        return Promise.resolve(false)
    }

    async getClientsByUserId(userId) {
        const clientIds = this.usersClients.get(userId)
        if (!clientIds) return Promise.resolve([])
        const clients = Array.from(clientIds)
            .map((id) => this.allClients.get(id))
            .filter(Boolean)
        this.logger.debug(
            `[InMemory] Отримання клієнтів для користувача ${userId}: ${clients.length}.`,
        )
        return Promise.resolve(clients)
    }

    async getAllClients() {
        this.logger.debug(`[InMemory] Отримання всіх клієнтів: ${this.allClients.size}.`)
        return Promise.resolve(Array.from(this.allClients.values()))
    }

    async clientExists(clientId) {
        return Promise.resolve(this.allClients.has(clientId))
    }

    // --- Неймспейси ---
    async addNamespace(namespacePath, namespaceInfo) {
        if (!this.namespaces.has(namespacePath)) {
            this.namespaces.set(namespacePath, { info: namespaceInfo, rooms: new Map() })
            this.logger.debug(`[InMemory] Неймспейс ${namespacePath} додано.`)
            return Promise.resolve(true)
        }
        return Promise.resolve(false)
    }

    async getNamespace(namespacePath) {
        const nsData = this.namespaces.get(namespacePath)
        this.logger.debug(`[InMemory] Отримання неймспейсу ${namespacePath}.`)
        return Promise.resolve(nsData ? nsData.info : undefined)
    }

    async namespaceExists(namespacePath) {
        return Promise.resolve(this.namespaces.has(namespacePath))
    }

    async removeNamespace(namespacePath) {
        if (this.namespaces.has(namespacePath)) {
            // Видаляємо також усіх клієнтів з кімнат цього неймспейсу
            const nsData = this.namespaces.get(namespacePath)
            if (nsData) {
                for (const roomData of nsData.rooms.values()) {
                    for (const clientId of roomData.clients) {
                        // Потрібно також оновити `allClients` та `usersClients` якщо ці клієнти
                        // більше не мають інших підключень в системі.
                        // Для простоти In-Memory, ми просто видаляємо їх з кімнат,
                        // але Server.disconnectClient() буде повністю керувати видаленням клієнта.
                    }
                }
            }
            this.namespaces.delete(namespacePath)
            this.logger.debug(`[InMemory] Неймспейс ${namespacePath} видалено.`)
            return Promise.resolve(true)
        }
        return Promise.resolve(false)
    }

    async getAllNamespaces() {
        this.logger.debug(`[InMemory] Отримання всіх неймспейсів: ${this.namespaces.size}.`)
        return Promise.resolve(Array.from(this.namespaces.keys())) // Повертаємо лише шляхи
    }

    // --- Кімнати ---
    async addRoom(namespacePath, roomInfo) {
        const nsData = this.namespaces.get(namespacePath)
        if (nsData) {
            if (!nsData.rooms.has(roomInfo.id)) {
                nsData.rooms.set(roomInfo.id, { info: roomInfo, clients: new Set() })
                this.logger.debug(
                    `[InMemory] Кімнату ${roomInfo.id} в неймспейсі ${namespacePath} додано.`,
                )
                return Promise.resolve(true)
            }
        }
        return Promise.resolve(false)
    }

    async getRoom(namespacePath, roomId) {
        const nsData = this.namespaces.get(namespacePath)
        if (nsData) {
            const roomData = nsData.rooms.get(roomId)
            this.logger.debug(`[InMemory] Отримання кімнати ${roomId} в ${namespacePath}.`)
            return Promise.resolve(roomData ? roomData.info : undefined)
        }
        return Promise.resolve(undefined)
    }

    async removeRoom(namespacePath, roomId) {
        const nsData = this.namespaces.get(namespacePath)
        if (nsData) {
            if (nsData.rooms.has(roomId)) {
                // Видаляємо всіх клієнтів з цієї кімнати
                const roomData = nsData.rooms.get(roomId)
                if (roomData) {
                    roomData.clients.clear() // Просто очищаємо список клієнтів кімнати
                }
                const result = nsData.rooms.delete(roomId)
                this.logger.debug(
                    `[InMemory] Кімнату ${roomId} в неймспейсі ${namespacePath} видалено: ${result}.`,
                )
                return Promise.resolve(result)
            }
        }
        return Promise.resolve(false)
    }

    async roomExists(namespacePath, roomId) {
        const nsData = this.namespaces.get(namespacePath)
        return Promise.resolve(nsData ? nsData.rooms.has(roomId) : false)
    }

    async getRoomsByNamespace(namespacePath) {
        const nsData = this.namespaces.get(namespacePath)
        if (nsData) {
            this.logger.debug(
                `[InMemory] Отримання кімнат для неймспейсу ${namespacePath}: ${nsData.rooms.size}.`,
            )
            return Promise.resolve(Array.from(nsData.rooms.values()).map((r) => r.info))
        }
        return Promise.resolve([])
    }

    async addClientToRoom(namespacePath, roomId, clientId) {
        const nsData = this.namespaces.get(namespacePath)
        if (nsData) {
            const roomData = nsData.rooms.get(roomId)
            if (roomData) {
                const clientExistsGlobally = this.allClients.has(clientId)
                if (clientExistsGlobally) {
                    roomData.clients.add(clientId)
                    this.logger.debug(
                        `[InMemory] Клієнта ${clientId} додано до кімнати ${roomId} в ${namespacePath}.`,
                    )
                    return Promise.resolve(true)
                } else {
                    this.logger.warn(
                        `[InMemory] Спроба додати неіснуючого клієнта ${clientId} до кімнати ${roomId}.`,
                    )
                    return Promise.resolve(false)
                }
            }
        }
        return Promise.resolve(false)
    }

    async removeClientFromRoom(namespacePath, roomId, clientId) {
        const nsData = this.namespaces.get(namespacePath)
        if (nsData) {
            const roomData = nsData.rooms.get(roomId)
            if (roomData) {
                const result = roomData.clients.delete(clientId)
                this.logger.debug(
                    `[InMemory] Клієнта ${clientId} видалено з кімнати ${roomId} в ${namespacePath}: ${result}.`,
                )
                return Promise.resolve(result)
            }
        }
        return Promise.resolve(false)
    }

    async getClientsInRoom(namespacePath, roomId) {
        const nsData = this.namespaces.get(namespacePath)
        if (nsData) {
            const roomData = nsData.rooms.get(roomId)
            if (roomData) {
                const clientIds = Array.from(roomData.clients)
                const clients = clientIds.map((id) => this.allClients.get(id)).filter(Boolean)
                this.logger.debug(
                    `[InMemory] Отримання клієнтів в кімнаті ${roomId} в ${namespacePath}: ${clients.length}.`,
                )
                return Promise.resolve(clients)
            }
        }
        return Promise.resolve([])
    }

    async countClientsInRoom(namespacePath, roomId) {
        const nsData = this.namespaces.get(namespacePath)
        if (nsData) {
            const roomData = nsData.rooms.get(roomId)
            if (roomData) {
                this.logger.debug(
                    `[InMemory] Підрахунок клієнтів в кімнаті ${roomId} в ${namespacePath}: ${roomData.clients.size}.`,
                )
                return Promise.resolve(roomData.clients.size)
            }
        }
        return Promise.resolve(0)
    }

    // --- Pub/Sub ---
    async publish(channel, message) {
        this.logger.debug(
            `[InMemory] Публікація в каналі '${channel}': ${JSON.stringify(message).substring(
                0,
                100,
            )}...`,
        )
        const subscribers = this.pubSubChannels.get(channel)
        if (subscribers) {
            subscribers.forEach((callback) => {
                // Виконати асинхронно, щоб не блокувати
                setTimeout(() => callback(channel, message), 0)
            })
        }
        return Promise.resolve(true)
    }

    async subscribe(channel, callback) {
        if (!this.pubSubChannels.has(channel)) {
            this.pubSubChannels.set(channel, new Set())
        }
        this.pubSubChannels.get(channel).add(callback)
        this.logger.debug(`[InMemory] Підписано на канал '${channel}'.`)
        return Promise.resolve(true)
    }

    async unsubscribe(channel, callback) {
        const subscribers = this.pubSubChannels.get(channel)
        if (subscribers) {
            subscribers.delete(callback)
            if (subscribers.size === 0) {
                this.pubSubChannels.delete(channel)
            }
            this.logger.debug(`[InMemory] Відписано від каналу '${channel}'.`)
            return Promise.resolve(true)
        }
        return Promise.resolve(false)
    }

    // --- Загальні методи ---
    async clearAll() {
        this.allClients.clear()
        this.usersClients.clear()
        this.namespaces.clear()
        this.pubSubChannels.clear()
        this.logger.warn('InMemoryStateStorage: Усі дані очищено.')
        return Promise.resolve(true)
    }

    async disconnect() {
        this.logger.info('InMemoryStateStorage: Імітація відключення.')
        // В реальності тут могли б бути очищення таймерів чи інших ресурсів,
        // але для In-Memory нічого особливого.
        return Promise.resolve(true)
    }
}

export { InMemoryStateStorage }
