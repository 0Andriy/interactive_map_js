// src/SocketAuthHandler.js

import { SocketManager } from './core/SocketManager.js'
import { Logger } from './di/Logger.js'

/**
 * @param {object} wss Об'єкт WebSocketServer
 * @param {SocketManager} socketManager
 * @param {Logger} logger
 */
export function setupWebSocketAuth(wss, socketManager, logger) {
    wss.on('connection', (ws, req) => {
        // --- 1. Аутентифікація / Отримання User ID ---

        // У реальному застосуванні:
        // 1. Перевірка токена (Bearer/Cookie) або query params.
        // 2. Декодування токена, отримання User ID.
        // 3. Якщо перевірка не пройшла: ws.close(4001, 'Unauthorized'); return;

        const url = new URL(req.url, `http://${req.headers.host}`)

        // Тимчасова логіка для тестування:
        const userId =
            url.searchParams.get('userId') || 'anon-' + Math.random().toString(36).substring(2, 9)

        // --- 2. Передача керування SocketManager ---

        socketManager.handleNewConnection(ws, req.url, userId)
        logger.log(`New connection established for User ${userId} on path ${req.url}`)
    })
}
