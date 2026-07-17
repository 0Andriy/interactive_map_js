import { SessionRepository } from './session.repository.js'
import { SessionCronWorker } from './session.cron.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     SessionModel:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: "Первинний ключ запису сесії в Oracle DB"
 *           example: 1024
 *         userId:
 *           type: integer
 *           description: "Логічний зв'язок з USERS.ID"
 *           example: 42
 *         userLogin:
 *           type: string
 *           description: "Денормалізований логін для швидкого аудиту"
 *           example: "ivan_petrov"
 *         jti:
 *           type: string
 *           format: uuid
 *           description: "JWT ID, запечений всередині обох токенів для повної зв'язки"
 *           example: "c3b07384-d113-495f-9e63-c7b41b41bb02"
 *         tokenHash:
 *           type: string
 *           description: "SHA-256 хеш від повного рядка Refresh JWT"
 *           example: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
 *         parentJti:
 *           type: string
 *           format: uuid
 *           nullable: true
 *           description: "JTI попереднього токена для контролю ланцюжка ротацій"
 *           example: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"
 *         userAgent:
 *           type: string
 *           example: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)..."
 *         ipAddress:
 *           type: string
 *           example: "192.168.1.25"
 *         deviceFingerprint:
 *           type: string
 *           nullable: true
 *           example: "8a4f9b2c3d1e6f7a"
 *         rotationCount:
 *           type: integer
 *           example: 3
 *         expiresAt:
 *           type: string
 *           format: date-time
 *           example: "2026-06-21T12:00:00Z"
 *         createdAt:
 *           type: string
 *           format: date-time
 *           example: "2026-05-22T12:00:00Z"
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           example: "2026-05-22T12:15:00Z"
 *         revokedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           example: "2026-05-22T12:15:00Z"
 *           description: "Якщо NULL — сесія активна. Інакше — точний час закриття/заміни сесії"
 *         revokeReason:
 *           type: string
 *           nullable: true
 *           enum: [logout, rotated, expired, compromised_chain_reuse, grace_period_recovery, session_limit_exceeded]
 *           example: "rotated"
 */

export class SessionModule {
    /**
     * @param {Object} dbManager - Глобальний менеджер підключень до Oracle
     */
    constructor({ dbManager }) {
        // Створюємо єдиний екземпляр репозиторію
        this.repository = new SessionRepository(dbManager)

        // Запускаємо cron
        const cronWorker = new SessionCronWorker(this.repository, dbManager)
        cronWorker.init()
    }

    /**
     * Експортуємо внутрішні компоненти модуля для використання в інших частинах додатку
     */
    exports() {
        return {
            repository: this.repository,
        }
    }
}
