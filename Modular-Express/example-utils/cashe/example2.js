import express from 'express'
import { cacheMiddleware, invalidateCache } from './cacheService.js'

const router = express.Router()

/**
 * Отримання конкретного уроку.
 * Ключ у Redis буде: cache:lessons:courseId:1:moduleId:5:lessonId:10
 * Теги дозволять нам знайти цей запис, якщо ми захочемо скинути кеш всього модуля.
 */
router.get(
    '/courses/:courseId/modules/:moduleId/lessons/:lessonId',
    cacheMiddleware({
        prefix: 'lessons',
        ttl: 7200, // 2 години
        tags: (req) => [
            `course:${req.params.courseId}`,
            `module:${req.params.moduleId}`,
            `lesson:${req.params.lessonId}`,
        ],
    }),
    async (req, res) => {
        const { courseId, moduleId, lessonId } = req.params
        // Важка логіка: пошук уроку, перевірка доступу, завантаження відео-лінків
        const lesson = await db.lesson.findUnique({ where: { id: lessonId } })
        res.json(lesson)
    },
)

/**
 * Оновлення уроку.
 * Використовуємо інвалідацію за тегом конкретного уроку ТА тегом модуля
 * (оскільки в модулі міг змінитись список уроків або їх порядок).
 */
router.patch(
    '/courses/:courseId/modules/:moduleId/lessons/:lessonId',
    invalidateCache({
        tags: (req) => [`lesson:${req.params.lessonId}`, `module:${req.params.moduleId}`],
    }),
    async (req, res) => {
        // Оновлення в БД...
        res.json({ message: 'Lesson updated, cache cleared' })
    },
)

/**
 * Видалення всього курсу.
 * Очистить ВСІ уроки, ВСІ модулі та ВСІ списки, що мають тег цього курсу.
 */
router.delete(
    '/courses/:courseId',
    invalidateCache({
        tags: (req) => [`course:${req.params.courseId}`],
        prefix: 'courses', // додатково чистимо загальні списки курсів
    }),
    async (req, res) => {
        // Видалення...
        res.status(204).end()
    },
)
