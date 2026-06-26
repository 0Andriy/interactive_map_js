import { registerChatController } from './chat.controller.js'
// import { registerNotificationController } from './notification.controller.js';

/**
 * Ініціалізація та мапінг всієї бізнес-логіки сокетів
 * @param {import('../modules/socket-engine/core/IoServer.js').IoServer} io
 */
export function initSocketControllers(io) {
    // Беремо потрібні простори назв і прокидаємо їх у контролери
    registerChatController(io.of('/chat'))

    // registerNotificationController(io.of('/notifications'));
}
