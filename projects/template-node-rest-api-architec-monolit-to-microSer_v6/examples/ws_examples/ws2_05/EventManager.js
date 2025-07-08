// src/server/EventManager.js
import { createClient } from 'redis'
import 'dotenv/config'

class EventManager {
    constructor() {
        // Внутрішній Pub/Sub для спостереження за подіями сервера (не для розсилки клієнтам)
        // this.subscriptions = new Map(); // Можна використовувати для внутрішніх сповіщень між компонентами

        // Redis client для публікації повідомлень у кластері
        this.publisher = createClient({ url: process.env.REDIS_URL })
        this.publisher.on('error', (err) => console.error('Redis Publisher Error:', err))
        this.publisher
            .connect()
            .then(() => {
                console.log('Redis publisher connected.')
            })
            .catch((err) => {
                console.error('Failed to connect Redis publisher:', err)
                process.exit(1)
            })

        // Redis client для підписки на повідомлення з інших вузлів
        this.subscriber = createClient({ url: process.env.REDIS_URL })
        this.subscriber.on('error', (err) => console.error('Redis Subscriber Error:', err))
        this.subscriber
            .connect()
            .then(() => {
                console.log('Redis subscriber connected.')
                this.subscriber.subscribe(
                    'ws_cluster_commands',
                    this._handleClusterCommand.bind(this),
                )
            })
            .catch((err) => {
                console.error('Failed to connect Redis subscriber:', err)
                process.exit(1)
            })
    }

    /**
     * Обробляє команди, отримані від Redis-брокера (для масштабування).
     * @param {string} message - JSON-рядок з командою.
     */
    _handleClusterCommand(message) {
        try {
            const command = JSON.parse(message)
            // Ці команди будуть оброблятися в MyWebSocketServer або MessageRouter
            // EventManager тільки розсилає повідомлення локально або публікує у Redis.
            // Реальна обробка команд від Redis буде в MyWebSocketServer (якщо це команди для самого сервера)
            // або MessageRouter (якщо це команди, що ініціюють дії з клієнтами).
            // У цьому прикладі, ми просто логуємо, а реальну логіку відключення
            // користувача ми залишимо в ws-server.js.
            console.log(`Received cluster command from Redis:`, command)

            // Приклад: якщо це команда на розсилку повідомлення в кімнату
            if (command.type === 'publishToRoom' && this.clientManager) {
                const { roomName, payload, excludeClientId } = command.payload
                this._publishToLocalClientsInRoom(
                    roomName,
                    payload,
                    this.clientManager,
                    excludeClientId,
                )
            }
            // Приклад: якщо це команда на розсилку повідомлення в namespace
            else if (command.type === 'publishToNamespace' && this.clientManager) {
                const { namespaceName, payload, excludeClientId } = command.payload
                this._publishToLocalClientsInNamespace(
                    namespaceName,
                    payload,
                    this.clientManager,
                    excludeClientId,
                )
            }
            // Приклад: якщо це глобальна розсилка
            else if (command.type === 'publishGlobally' && this.clientManager) {
                const { payload, excludeClientId } = command.payload
                this._publishToLocalClientsGlobally(payload, this.clientManager, excludeClientId)
            }
        } catch (e) {
            console.error('Error parsing or handling Redis cluster command:', e)
        }
    }

    /**
     * Налаштовує ClientManager для EventManager. Викликається MyWebSocketServer.
     * Це необхідно для циклічної залежності (EventManager потребує ClientManager для розсилки).
     * @param {ClientManager} clientManager
     */
    setClientManager(clientManager) {
        this.clientManager = clientManager
    }

    /**
     * Розсилає повідомлення всім клієнтам у певній кімнаті.
     * Публікує команду в Redis для розсилки між вузлами.
     * @param {string} roomName
     * @param {object} payload
     * @param {ClientManager} clientManager
     * @param {string} [excludeClientId]
     */
    publishToRoom(roomName, payload, clientManager, excludeClientId = null) {
        const command = {
            type: 'publishToRoom',
            payload: { roomName, payload, excludeClientId },
        }
        // Публікуємо в Redis для інших вузлів
        this.publisher.publish('ws_cluster_commands', JSON.stringify(command))

        // Розсилаємо локально
        this._publishToLocalClientsInRoom(roomName, payload, clientManager, excludeClientId)
    }

    /**
     * Внутрішня функція для розсилки повідомлень ЛОКАЛЬНИМ клієнтам у кімнаті.
     * @param {string} roomName
     * @param {object} payload
     * @param {ClientManager} clientManager
     * @param {string} [excludeClientId]
     */
    _publishToLocalClientsInRoom(roomName, payload, clientManager, excludeClientId = null) {
        const message = JSON.stringify(payload)
        for (const client of clientManager.getAllClients()) {
            if (
                client.isInRoom(roomName) &&
                client.id !== excludeClientId &&
                client.ws.readyState === client.ws.OPEN
            ) {
                client.ws.send(message)
            }
        }
    }

    /**
     * Розсилає повідомлення всім клієнтам у певному просторі імен.
     * Публікує команду в Redis для розсилки між вузлами.
     * @param {string} namespaceName
     * @param {object} payload
     * @param {ClientManager} clientManager
     * @param {string} [excludeClientId]
     */
    publishToNamespace(namespaceName, payload, clientManager, excludeClientId = null) {
        const command = {
            type: 'publishToNamespace',
            payload: { namespaceName, payload, excludeClientId },
        }
        this.publisher.publish('ws_cluster_commands', JSON.stringify(command))

        this._publishToLocalClientsInNamespace(
            namespaceName,
            payload,
            clientManager,
            excludeClientId,
        )
    }

    /**
     * Внутрішня функція для розсилки повідомлень ЛОКАЛЬНИМ клієнтам у просторі імен.
     * @param {string} namespaceName
     * @param {object} payload
     * @param {ClientManager} clientManager
     * @param {string} [excludeClientId]
     */
    _publishToLocalClientsInNamespace(
        namespaceName,
        payload,
        clientManager,
        excludeClientId = null,
    ) {
        const message = JSON.stringify(payload)
        const clientsInNamespace = clientManager.getClientsInNamespace(namespaceName)
        clientsInNamespace.forEach((client) => {
            if (client.id !== excludeClientId && client.ws.readyState === client.ws.OPEN) {
                client.ws.send(message)
            }
        })
    }

    /**
     * Розсилає повідомлення всім підключеним клієнтам (глобальна розсилка).
     * Публікує команду в Redis для розсилки між вузлами.
     * @param {object} payload
     * @param {ClientManager} clientManager
     * @param {string} [excludeClientId]
     */
    publishGlobally(payload, clientManager, excludeClientId = null) {
        const command = {
            type: 'publishGlobally',
            payload: { payload, excludeClientId },
        }
        this.publisher.publish('ws_cluster_commands', JSON.stringify(command))

        this._publishToLocalClientsGlobally(payload, clientManager, excludeClientId)
    }

    /**
     * Внутрішня функція для розсилки повідомлень ВСІМ ЛОКАЛЬНИМ клієнтам.
     * @param {object} payload
     * @param {ClientManager} clientManager
     * @param {string} [excludeClientId]
     */
    _publishToLocalClientsGlobally(payload, clientManager, excludeClientId = null) {
        const message = JSON.stringify(payload)
        clientManager.getAllClients().forEach((client) => {
            if (client.id !== excludeClientId && client.ws.readyState === client.ws.OPEN) {
                client.ws.send(message)
            }
        })
    }

    /**
     * Публікує команду на відключення користувача до Redis для всіх WS-серверів.
     * Ця команда буде оброблятися _handleClusterCommand або в іншому місці,
     * де підписаний саме на команди для WS-сервера.
     * @param {string} userId - ID користувача для відключення.
     */
    publishDisconnectCommand(userId) {
        const command = {
            type: 'disconnectUser',
            payload: { userId: userId },
        }
        this.publisher.publish('ws_cluster_commands', JSON.stringify(command))
        console.log(`Disconnect command for user ${userId} published to Redis.`)
    }

    /**
     * Підписує локальний слухач на внутрішні події.
     * Можна використовувати, якщо EventManager також виступає як внутрішній EventBus.
     * У цій реалізації ми здебільшого використовуємо його для Redis-інтеграції.
     */
    subscribe(eventName, callback) {
        // Внутрішня логіка Pub/Sub, якщо EventManager має локальних підписників
        // if (!this.subscriptions.has(eventName)) {
        //   this.subscriptions.set(eventName, new Set());
        // }
        // this.subscriptions.get(eventName).add(callback);
    }

    /**
     * Відписує локальний слухач від внутрішніх подій.
     */
    unsubscribe(eventName, callback) {
        // if (this.subscriptions.has(eventName)) {
        //   this.subscriptions.get(eventName).delete(callback);
        //   if (this.subscriptions.get(eventName).size === 0) {
        //     this.subscriptions.delete(eventName);
        //   }
        // }
    }

    /**
     * Публікує внутрішню подію.
     */
    publishInternalEvent(eventName, data) {
        // if (this.subscriptions.has(eventName)) {
        //   this.subscriptions.get(eventName).forEach(callback => {
        //     setImmediate(() => callback(data));
        //   });
        // }
    }
}

export default EventManager
