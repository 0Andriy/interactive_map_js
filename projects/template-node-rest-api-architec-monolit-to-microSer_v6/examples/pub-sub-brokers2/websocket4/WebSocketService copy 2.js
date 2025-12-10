/**
 * @file Основной класс менеджера WebSocket-сервера, отвечающий за инициализацию,
 * управление соединениями и маршрутизацию событий.
 */

import { WebSocketServer } from 'ws'
import WebSocketConnection from './WebSocketConnection.js'
import WebSocketNamespace from './WebSocketNamespace.js'

/**
 * Главный менеджер WebSocket-сервера.
 * Отвечает за инициализацию сервера, управление глобальными соединениями
 * и маршрутизацию сообщений в соответствующие пространства имен и их обработчики.
 */
class WsServerManager {
    /** @private @type {string} Унікальний ID цього процесу/інстанса. */
    #serverInstanceId
    /** @private @type {object} Экземпляр WebSocket сервера (например, из 'ws'). */
    #wss
    /** @private @type {Map<string, WebSocketConnection>} Глобальная карта активных соединений по ID. */
    #connections = new Map()
    /** @private @type {Map<string, WebSocketNamespace>} Карта пространств имен (chat, game и т.д.). */
    #namespaces = new Map()
    /** @private @type {object} Объект логера. */
    #logger
    /** @private @type {object | null} Брокер сообщений для горизонтального масштабирования. */
    #pubSubBroker

    /**
     * Создает экземпляр WsServerManager и инициализирует сервер.
     * @param {object} config - Объект конфигурации.
     * @param {number} config.port - Порт сервера.
     * @param {object} config.logger - Объект логера (например, console, winston).
     * @param {object} [config.pubSubBroker] - Брокер сообщений (например, Redis client).
     * @param {object} config.namespaceHandlers - Объект с функциями обработки для каждого NS.
     */
    constructor(config) {
        // Генеруємо унікальний ID для цього запуску сервера
        this.#serverInstanceId = crypto.randomUUID()
        this.#logger = config.logger || console
        this.#pubSubBroker = config.pubSubBroker || null

        this.#wss = new WebSocketServer({ port: config.port })
        this.#logger.info(`WebSocket Server запущен на порту ${config.port}`)

        this.#setupNamespaces(config.namespaceHandlers)
        this.#wss.on('connection', this.#handleConnection)
    }

    /**
     * Инициализирует пространства имен и привязывает к ним внешние обработчики логики.
     * @private
     * @param {object} handlers - Внешние функции-обработчики для каждого пространства имен.
     */
    #setupNamespaces(handlers) {
        for (const nsName in handlers) {
            if (Object.hasOwnProperty.call(handlers, nsName)) {
                const nsHandler = handlers[nsName]
                // Передаем logger и pubSubBroker в конструктор Namespace
                const namespace = new WebSocketNamespace(
                    nsName,
                    this.#connections,
                    this.#logger,
                    this.#pubSubBroker,
                )
                this.#namespaces.set(nsName, namespace)

                // Привязываем внешнюю логику к свойству onMessage пространства имен
                namespace.onMessage = nsHandler.bind(this)
            }
        }
    }

    /**
     * Обрабатывает новое WebSocket-соединение при его установке.
     * @private
     * @param {object} ws - Новый объект WebSocket.
     */
    #handleConnection = (ws) => {
        const connectionId = crypto.randomUUID()
        const connection = new WebSocketConnection(ws, connectionId, this.#logger)
        this.#connections.set(connectionId, connection)

        this.#logger.info(`Установлено новое соединение: ${connectionId}`)

        ws.on('message', (message) => this.#handleMessage(connectionId, message))
        ws.on('close', () => this.#handleClose(connectionId))
        ws.on('pong', () => connection.markAlive())
    }

    /**
     * Маршрутизирует входящие сообщения от клиентов к соответствующему пространству имен.
     * @private
     * @param {string} connectionId - ID отправителя.
     * @param {string | Buffer} message - Входящее сообщение.
     */
    #handleMessage = (connectionId, message) => {
        const connection = this.#connections.get(connectionId)
        if (!connection) return

        try {
            // Ожидаемый формат: { namespace: 'chat', type: 'ACTION_TYPE', payload: {...} }
            const parsedMessage = JSON.parse(message)
            const { namespace, type, payload } = parsedMessage

            const ns = this.#namespaces.get(namespace)

            if (ns && typeof ns.onMessage === 'function') {
                // Вызываем внешний обработчик, передавая контекст NS, соединение и данные
                ns.onMessage(ns, connection, type, payload)
            } else {
                this.#logger.warn(`Обработчик не найден для пространства имен: ${namespace}`)
                connection.send(
                    JSON.stringify({ error: 'Неизвестное пространство имен или тип действия' }),
                )
            }
        } catch (error) {
            this.#logger.error(`Ошибка обработки сообщения от ${connectionId}:`, error)
        }
    }

    /**
     * Обрабатывает закрытие WebSocket-соединения.
     * @private
     * @param {string} connectionId - ID закрываемого соединения.
     */
    #handleClose = (connectionId) => {
        this.#logger.info(`Соединение закрыто: ${connectionId}`)
        const connection = this.#connections.get(connectionId)

        if (connection) {
            // Удаляем соединение из всех комнат и глобальной карты
            this.#namespaces.forEach((ns) => {
                connection.leaveNamespace(ns.name)
            })
            this.#connections.delete(connectionId)
        }
    }
}

export default WsServerManager
