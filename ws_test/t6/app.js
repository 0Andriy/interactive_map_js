import express from 'express'
import { initSocketControllers } from './socket-controllers/index.js'
import { mainRouter } from './routes/index.js' // Ваші HTTP роути

/**
 * Фабрика створення Express додатку
 * @param {import('./modules/socket-engine/core/IoServer.js').IoServer} io - Наш інстанс сокет-сервера
 */
export function createExpressApp(io) {
    const app = express()

    // ГЛОБАЛЬНЕ ВПРОВАДЖЕННЯ: робимо io доступним у будь-якому HTTP-релевантному місці
    app.set('io', io)

    // Стандартні мідлвари Express
    app.use(express.json())

    // 1. Підключаємо бізнес-логіку самих сокетів (кімнати, події клієнтів)
    initSocketControllers(io)

    // 2. Підключаємо звичайні REST API роути
    app.use('/api/v1', mainRouter)

    return app
}

/**
 * Ендпоінт успішної оплати замовлення (HTTP POST)
 */
export async function handleSuccessfulPayment(req, res) {
    try {
        const { userId, orderId, amount } = req.body

        // ... Логіка збереження в базу даних, списання грошей тощо ...

        // ОДИН РЯДОК МАГІЇ: Дістаємо наш io сервер прямо з HTTP запиту!
        /** @type {import('../modules/socket-engine/core/IoServer.js').IoServer} */
        const io = req.app.get('io')

        // Надсилаємо пуш-сповіщення унікальному користувачу в його персональну кімнату чату
        // Наші адаптери розішлють це повідомлення, навіть якщо користувач сидить на іншій ноді в Redis кластері!
        io.of('/chat')
            .to(userId)
            .emit('notification', {
                type: 'PAYMENT_SUCCESS',
                title: 'Оплату зараховано!',
                message: `Замовлення #${orderId} на суму ${amount} грн успішно оплачено.`,
            })

        // Повертаємо стандартну HTTP відповідь
        return res
            .status(200)
            .json({ success: true, message: 'Payment processed and user notified' })
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message })
    }
}
