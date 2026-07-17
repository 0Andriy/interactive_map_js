// auth.js
import { executeQuery } from './db.js'

export async function checkAccess(userId, documentId, context) {
    // --- 1. СИТО ReBAC (Зв'язки) ---
    // Перевіряємо, чи є користувач учасником проекту, якому належить документ
    const relationSql = `
    SELECT 1 FROM project_members pm
    JOIN documents d ON pm.project_id = d.project_id
    WHERE pm.user_id = :userId AND d.id = :documentId
  `
    const relations = await executeQuery(relationSql, { userId, documentId })
    if (relations.length === 0) {
        return { allowed: false, reason: 'ReBAC: Ви не належите до проекту цього документа' }
    }

    // --- 2. СИТО RBAC (Ролі) ---
    // Перевіряємо роль користувача в цьому проекті
    const roleSql = `
    SELECT role FROM project_members
    WHERE user_id = :userId AND project_id = (SELECT project_id FROM documents WHERE id = :documentId)
  `
    const roles = await executeQuery(roleSql, { userId, documentId })
    const userRole = roles[0]?.ROLE

    if (userRole !== 'Manager' && userRole !== 'Admin') {
        return { allowed: false, reason: 'RBAC: Ваша роль не має прав на редагування' }
    }

    // --- 3. СИТО ABAC (Атрибути та Контекст) ---
    // Перевіряємо динамічні умови (час та IP-адресу)
    const currentHour = new Date().getHours()
    const isWorkingHours = currentHour >= 9 && currentHour <= 18
    const isCorporateIp = context.ip.startsWith('192.168.')

    if (!isWorkingHours) {
        return {
            allowed: false,
            reason: 'ABAC: Доступ дозволено лише в робочий час (09:00 - 18:00)',
        }
    }

    if (!isCorporateIp) {
        return { allowed: false, reason: 'ABAC: Доступ дозволено лише з корпоративної мережі' }
    }

    // Якщо всі три сита пройдено успішно
    return { allowed: true }
}

// app.js
import { checkAccess } from './auth.js'

async function handleDocumentEditRequest() {
    // Дані, що прийшли від клієнта
    const currentUserId = 42
    const targetDocumentId = 101
    const requestContext = {
        ip: '192.168.1.55', // внутрішній IP
        time: new Date(),
    }

    console.log('Перевірка прав доступу...')

    const authResult = await checkAccess(currentUserId, targetDocumentId, requestContext)

    if (authResult.allowed) {
        console.log('✅ Доступ НАДАНО. Виконуємо редагування документа.')
    } else {
        console.log(`❌ Доступ ЗАБОРОНЕНО. Причина: ${authResult.reason}`)
    }
}

handleDocumentEditRequest()

// Якщо є jwt зашиваємо дані в payload

// middleware/auth.js
import { verifyUserToken } from '../authService.js'

export function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Токен відсутній' })
    }

    const token = authHeader.split(' ')[1]
    const decoded = verifyUserToken(token)

    if (!decoded) {
        return res.status(401).json({ error: 'Невалідний або прострочений токен' })
    }

    // Зберігаємо дані з JWT у об'єкт запиту для наступних мідлварів
    req.user = decoded
    next()
}

// middleware/rbac.js
export function checkGlobalRoles(allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(500).json({ error: 'Користувач не автентифікований (відсутній JWT)' })
        }

        // Якщо у користувача роль Global_Admin — пропускаємо без черги далі
        if (req.user.role === 'Global_Admin') {
            return next()
        }

        // Перевіряємо, чи входить роль користувача у список дозволених для цього роуту
        if (!allowedRoles.includes(req.user.role)) {
            return res
                .status(403)
                .json({ error: `RBAC: Доступ заборонено для ролі ${req.user.role}` })
        }

        next()
    }
}

// middleware/rbac.js
export function checkGlobalRoles(allowedRoles) {
    return (req, res, next) => {
        if (!req.user || !Array.isArray(req.user.roles)) {
            return res.status(500).json({ error: 'Ролі користувача не знайдено або невалідні' })
        }

        // Супер-адмін завжди проходить без черги
        if (req.user.roles.includes('Global_Admin')) {
            return next()
        }

        // Шукаємо збіг (перетин двох масивів)
        // .some() повертає true, якщо хоча б одна роль користувача є в дозволених
        const hasPermission = req.user.roles.some((role) => allowedRoles.includes(role))

        if (!hasPermission) {
            return res.status(403).json({
                error: `RBAC: Доступ заборонено для ваших ролей [${req.user.roles.join(', ')}]`,
            })
        }

        next()
    }
}

// middleware/abac.js
export function checkContextABAC(req, res, next) {
    const clientIp = req.ip || req.connection.remoteAddress
    const currentHour = new Date().getHours()

    const isWorkingHours = currentHour >= 9 && currentHour <= 18
    const isCorporateIp = clientIp.startsWith('192.168.')

    // Якщо це Admin, можливо ви хочете ігнорувати обмеження ABAC?
    // Якщо ні — перевіряємо всіх:
    if (req.user?.role === 'Global_Admin') {
        return next()
    }

    if (!isWorkingHours) {
        return res.status(403).json({ error: 'ABAC: Доступ дозволено лише з 09:00 до 18:00' })
    }

    if (!isCorporateIp) {
        return res.status(403).json({ error: 'ABAC: Доступ дозволено лише з корпоративного IP' })
    }

    next()
}

// middleware/abac.js
export function checkContextABAC(req, res, next) {
    if (!req.user || !req.user.allowedHours) {
        return res.status(500).json({ error: 'Атрибути ABAC не знайдені в токені' })
    }

    // Глобальний адмін завжди має доступ 24/7
    if (req.user.roles.includes('Global_Admin')) {
        return next()
    }

    const currentHour = new Date().getHours()
    const { start, end } = req.user.allowedHours

    let isAllowedTime = false

    // Обробимо два випадки: звичайний графік (напр. 9-18) та нічний (напр. 22-06)
    if (start <= end) {
        // Звичайний денний графік
        isAllowedTime = currentHour >= start && currentHour <= end
    } else {
        // Нічна зміна (перехід через північ)
        isAllowedTime = currentHour >= start || currentHour <= end
    }

    if (!isAllowedTime) {
        return res.status(403).json({
            error: `ABAC: Доступ заборонено. Ваш робочий час: з ${start}:00 до ${end}:00. Поточна година: ${currentHour}:00`,
        })
    }

    // Перевірка IP (можна теж зробити гнучкою, але залишимо для прикладу)
    const clientIp = req.ip || req.connection.remoteAddress
    if (!clientIp.startsWith('192.168.')) {
        return res.status(403).json({ error: 'ABAC: Доступ дозволено лише з корпоративного IP' })
    }

    next()
}

// middleware/rebac.js
import { executeQuery } from '../db.js'

export async function checkProjectReBAC(req, res, next) {
    const { documentId } = req.params
    const userId = req.user?.userId

    if (req.user?.role === 'Global_Admin') {
        return next()
    }

    try {
        // SQL запит перевіряє ЗВ'ЯЗОК (ReBAC) та повертає РОЛЬ у проекті (Локальний RBAC)
        const rebacSql = `
      SELECT pm.role_in_project
      FROM project_members pm
      JOIN documents d ON pm.project_id = d.project_id
      WHERE pm.user_id = :userId AND d.id = :documentId
    `

        const rows = await executeQuery(rebacSql, { userId, documentId })

        if (rows.length === 0) {
            return res
                .status(403)
                .json({ error: 'ReBAC: Ви не є учасником проекту цього документа' })
        }

        // Додатково тут же перевіряємо внутрішню роль у проекті
        const projectRole = rows[0].ROLE_IN_PROJECT
        if (projectRole !== 'Manager' && projectRole !== 'Editor') {
            return res
                .status(403)
                .json({ error: 'RBAC: Недостатньо прав у цьому конкретному проекті' })
        }

        req.projectRole = projectRole // зберігаємо для контролера, якщо треба
        next()
    } catch (error) {
        return res.status(500).json({ error: 'Помилка бази даних при перевірці зв’язків' })
    }
}

// middleware/rebac.js
import { executeQuery } from '../db.js'

export async function checkProjectReBAC(req, res, next) {
    const { documentId } = req.params
    const userId = req.user?.userId

    if (req.user?.roles.includes('Global_Admin')) {
        return next()
    }

    try {
        // Запит повертає ВСІ ролі, які користувач має в цьому проекті
        // (наприклад, якщо він зайшов у проект через дві різні робочі групи)
        const rebacSql = `
      SELECT pm.role_in_project
      FROM project_members pm
      JOIN documents d ON pm.project_id = d.project_id
      WHERE pm.user_id = :userId AND d.id = :documentId
    `

        const rows = await executeQuery(rebacSql, { userId, documentId })

        // Якщо запит нічого не повернув — зв'язку (ReBAC) немає взагалі
        if (rows.length === 0) {
            return res
                .status(403)
                .json({ error: 'ReBAC: Ви не належите до проекту цього документа' })
        }

        // Трансформуємо результат у масив локальних ролей
        // Oracle повертає масив об'єктів, наприклад: [{ ROLE_IN_PROJECT: 'Editor' }, { ROLE_IN_PROJECT: 'Auditor' }]
        const userProjectRoles = rows.map((row) => row.ROLE_IN_PROJECT)

        // Визначаємо, які локальні ролі мають право редагувати документ
        const requiredProjectRoles = ['Manager', 'Editor']

        // Перевіряємо, чи є хоча б одна з локальних ролей користувача в дозволених
        const hasProjectPermission = userProjectRoles.some((role) =>
            requiredProjectRoles.includes(role),
        )

        if (!hasProjectPermission) {
            return res.status(403).json({
                error: `RBAC: Недостатньо прав у проекті. Ваші локальні ролі: [${userProjectRoles.join(', ')}]`,
            })
        }

        // Зберігаємо масив ролей у req, щоб контролер знав, які саме права є у користувача
        req.userProjectRoles = userProjectRoles
        next()
    } catch (error) {
        return res.status(500).json({ error: 'Помилка бази даних при перевірці локальних ролей' })
    }
}
