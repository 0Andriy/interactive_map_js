// WsServerManager.js (Сильно змінений)
// ... імпорти ...

class WsServerManager {
    // ... приватні поля #wss, #connections, #namespaces, #logger, #pubSubBroker ...

    constructor(config) {
        // ... ініціалізація логера, брокера, сервера ...
        this.#logger = config.logger || console
        this.#pubSubBroker = config.pubSubBroker // Тепер це обов'язково!

        // ... setupNamespaces ...
        this.#setupNamespaces(config.namespaceHandlers)
        this.#wss.on('connection', this.#handleConnection)

        // Підписуємося на єдиний глобальний канал команд при запуску
        this.#pubSubBroker.subscribe('ws:commands', this.#handleBrokerCommand)
    }

    // ... #setupNamespaces, #handleConnection, #handleClose залишаються схожими ...

    /**
     * @private
     * Обробляє КОМАНДИ, що надходять від КЛІЄНТА. Публікує їх у Redis.
     */
    #handleMessage = (connectionId, message) => {
        // Ми не обробляємо логіку тут! Ми просто ретранслюємо команду в Redis.
        const command = JSON.parse(message)
        command.senderId = connectionId // Додаємо ID відправника до команди

        this.#pubSubBroker.publish('ws:commands', JSON.stringify(command))
    }

    /**
     * @private
     * Обробляє КОМАНДИ, що надходять з Redis (включаючи ті, що надіслав цей інстанс).
     * Це єдине місце, де виконується бізнес-логіка.
     */
    #handleBrokerCommand = (message) => {
        try {
            const command = JSON.parse(message)
            const { namespace, type, payload, senderId } = command

            // Нам потрібно знайти Connection об'єкт, навіть якщо він локальний
            const connection = this.#connections.get(senderId)
            // Якщо connectionId існує на цьому інстансі, передаємо його.
            // Інакше connection буде undefined, і логіка має це обробити.

            const ns = this.#namespaces.get(namespace)
            if (ns && typeof ns.onMessage === 'function') {
                // Виконуємо логіку на всіх інстансах
                ns.onMessage(ns, connection, type, payload, senderId)
            }
        } catch (error) {
            this.#logger.error('Error processing command from Redis:', error)
        }
    }
}
