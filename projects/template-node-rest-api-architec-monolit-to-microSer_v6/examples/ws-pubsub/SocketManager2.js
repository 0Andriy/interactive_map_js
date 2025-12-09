// src/core/SocketManager.js

import { Namespace } from './Namespace.js'

export class SocketManager {
    // ... (constructor без змін) ...
    constructor(pubSubAdapter, logger) {
        /** @type {Map<string, Namespace>} */
        this.namespaces = new Map()
        this.pubSubAdapter = pubSubAdapter
        this.logger = logger
        this.defaultHandler = async (conn, message, ns) => {
            // Обробник за замовчуванням: просто повертає повідомлення
            if (message.type === 'ping') {
                conn.send('pong', { time: Date.now() })
            } else {
                ns.logger.log(`[${ns.name}] Unknown message type: ${message.type}`)
            }
        }

        this.logger.log('SocketManager initialized with DI.')
    }

    /**
     * Реєструє або повертає існуючий Namespace.
     * @param {string} name
     * @param {import('./Namespace.js').MessageHandler} [handler] Кастомний обробник (використовується лише при створенні).
     * @returns {Namespace}
     */
    getNamespace(name, handler = this.defaultHandler) {
        if (!this.namespaces.has(name)) {
            // Передаємо кастомний обробник в конструктор Namespace
            const ns = new Namespace(name, this.pubSubAdapter, this.logger, handler)
            this.namespaces.set(name, ns)
        }
        return this.namespaces.get(name)
    }

    // ... (handleNewConnection без змін, оскільки він викликає getNamespace) ...
    handleNewConnection(ws, path, userId) {
        // Визначаємо Namespace зі шляху
        const nsName = path.split('/')[2] || 'default'

        // Тут ми просто отримуємо вже існуючий Namespace (який має бути зареєстрований)
        const ns = this.getNamespace(nsName)

        const conn = ns.addConnection(ws, userId)

        // ... (ws.on('message'), ws.on('close') та ws.on('error') без змін) ...
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
