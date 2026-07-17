/**
 * Словник усіх подій системи.
 * Використовуйте ці константи замість "магічних рядків".
 * @readonly
 * @enum {string}
 */
export const BUS_EVENTS = {
    USER: {
        CREATED: 'user.created',
        UPDATED: 'user.updated',
        DELETED: 'user.deleted',
        LOGIN: 'user.login',
        WILDCARD: 'user.*', // Для підписки на всі події користувача
    },
    ORDER: {
        PLACED: 'order.placed',
        CANCELLED: 'order.cancelled',
        SHIPPED: 'order.shipped',
    },
    SYSTEM: {
        CONFIG_CHANGED: 'system.config_changed',
        ERROR: 'system.error',
        ALL: 'system.**', // Для підписки на всі рівні вкладеності
    },
}
