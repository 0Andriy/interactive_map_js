/**
 * Інтерфейс адаптера брокера повідомлень.
 * Забезпечує зв'язок (Pub/Sub) між різними вузлами кластера.
 * @interface
 */
export class IBrokerAdapter {
    /**
     * Підписується на певну тему (topic) у брокері.
     * @param {string} topic - Назва теми або каналу.
     * @param {(data: any) => Promise<void> | void} callback - Функція, що виконується при отриманні повідомлення.
     * @returns {Promise<() => Promise<void>>} Повертає асинхронну функцію для скасування підписки (unsubscribe).
     * @abstract
     */
    async subscribe(topic, callback) {
        throw new Error('Method "subscribe" must be implemented')
    }

    /**
     * Публікує дані в тему (topic) для інших учасників кластера.
     * @param {string} topic - Назва теми або каналу.
     * @param {any} data - Дані для передачі (зазвичай об'єкт, що серіалізується в JSON).
     * @returns {Promise<void>}
     * @abstract
     */
    async publish(topic, data) {
        throw new Error('Method "publish" must be implemented')
    }
}
