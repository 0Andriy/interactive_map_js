// src/core/SocketManager.js

import { Namespace } from './Namespace.js'

export class SocketManager {
    /**
     * @param {import('../di/PubSubAdapter.js').PubSubAdapter} pubSubAdapter
     * @param {import('../di/Logger.js').Logger} logger
     */
    constructor(pubSubAdapter, logger) {
        /** @type {Map<string, Namespace>} */
        this.namespaces = new Map()
        this.pubSubAdapter = pubSubAdapter
        this.logger = logger
        this.logger.log('SocketManager initialized with DI.')
    }

    /**
     * @param {string} name
     * @returns {Namespace}
     */
    getNamespace(name) {
        if (!this.namespaces.has(name)) {
            const ns = new Namespace(name, this.pubSubAdapter, this.logger)
            this.namespaces.set(name, ns)
        }
        return this.namespaces.get(name)
    }

    /**
     * Обробляє нове WebSocket підключення.
     * @param {object} ws Об'єкт ws-бібліотеки
     * @param {string} path Шлях підключення
     * @param {string} userId ID користувача
     */
    handleNewConnection(ws, path, userId) {
        const nsName = path.split('/')[2] || 'default'
        const ns = this.getNamespace(nsName)

        const conn = ns.addConnection(ws, userId)

        ws.on('message', async (message) => {
            await ns.handleMessage(conn.id, message.toString())
        })

        ws.on('close', () => {
            ns.removeConnection(conn.id)
        })

        ws.on('error', (error) => {
            this.logger.error(`Connection ${conn.id} error:`, error)
        })

        conn.send('connection:established', { id: conn.id, userId: conn.userId, namespace: nsName })
    }
}
