import { logger } from './logger.js'
import { WebSocket } from 'ws' // Import WebSocket for constants

/**
 * Налаштовує механізм "heartbeat" (пінг-понг) для підтримки активності WebSocket-з'єднань.
 * Кожні `interval` мілісекунд сервер надсилає пінг усім клієнтам.
 * Якщо клієнт не відповідає понгом, його з'єднання вважається неактивним і закривається.
 *
 * @param {WebSocket.Server} wssInstance - Екземпляр WebSocket.Server.
 * @param {object} [options] - Опції для налаштування heartbeat.
 * @param {number} [options.interval=30000] - Інтервал у мілісекундах для надсилання пінгів. За замовчуванням 30 секунд.
 * @param {Logger} [logger=console] - Об'єкт логера.
 */
export const setupHeartbeat = (wssInstance, options = {}, logger = console) => {
    const interval = options.interval || 30000 // 30 секунд за замовчуванням

    logger.info(`Setting up WebSocket heartbeat with interval: ${interval / 1000} seconds.`)

    const heartbeatInterval = setInterval(() => {
        wssInstance.clients.forEach((ws) => {
            /** @type {CustomWebSocket} */
            const clientWs = ws // Приведення типу для доступу до isAlive

            if (clientWs.isAlive === false) {
                logger.warn(
                    `Client ${clientWs.username} (${clientWs.id}) is unresponsive. Terminating connection.`,
                )
                return clientWs.terminate()
            }

            clientWs.isAlive = false
            clientWs.ping()
            logger.debug(`[Ping/Pong] Pinging client ${clientWs.username} (${clientWs.id}).`)
        })
    }, interval)

    // Очищаємо інтервал, коли сервер закривається
    wssInstance.on('close', () => {
        clearInterval(heartbeatInterval)
        logger.info('WebSocket heartbeat interval cleared.')
    })

    // Важливо: обробник 'pong' повинен бути на кожному клієнтському сокеті.
    // Він вже доданий у `server.js` при handleUpgrade.
}
