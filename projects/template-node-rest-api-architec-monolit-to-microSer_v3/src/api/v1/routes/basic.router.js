import { Router } from 'express'

const router = Router()

// prefix: /api/v1

/**
 * @swagger
 * /api/v1/health:
 *   get:
 *     tags:
 *       - Basic
 *     summary: Перевірка доступності API
 *     description: Перевіряє загальний стан API та його залежностей.
 *     responses:
 *       200:
 *         description: API працює
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "ok"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   example: "2023-10-27T10:00:00.000Z"
 *                 uptime:
 *                   type: number
 *                   example: 1234.56
 */
router.get('/health', (req, res) => {
    res.status(200).json({
        // загальний стан (наприклад, "ok")
        status: 'ok',
        // час відповіді сервера
        timestamp: new Date().toISOString(),
        // час безперервної роботи сервера
        uptime: process.uptime(),
        // додаткове повідомлення
        message: 'API is working',
    })
})

export default router
