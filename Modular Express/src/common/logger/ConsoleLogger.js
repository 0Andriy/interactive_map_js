import util from 'util'
import { AbstractLogger } from './AbstractLogger.js'
import { sanitize } from '../utils/sanitize.js'

// Конфігурація кольорів ANSI
const COLORS = {
    error: '\x1b[31m', // Червоний
    warn: '\x1b[33m', // Жовтий
    info: '\x1b[32m', // Зелений
    http: '\x1b[34m', // Синій
    debug: '\x1b[35m', // Фіолетовий
    reset: '\x1b[0m', // Скидання
    dim: '\x1b[90m', // Сірий (для метаданих)
    cyan: '\x1b[36m', // Ціан (для маркерів)
}

export class ConsoleLogger extends AbstractLogger {
    /**
     * Основний метод логування
     */
    log(level, message, data = {}) {
        // Перевірка рівня логування
        if (this.levels[level] > this.levels[this.level]) return

        const context = this._getContext()
        const timestamp = new Date().toISOString()

        // Форматування заголовка логу
        const color = COLORS[level] || COLORS.reset
        const levelTag = `${color}${level.toUpperCase().padEnd(5)}${COLORS.reset}`
        const timeTag = `${COLORS.dim}[${timestamp}]${COLORS.reset}`

        // Маскуємо контекст (якщо там є дані користувача)
        const sanitizedContext = sanitize(context)
        // Форматування контексту (requestId, user) - робимо його сірим
        const ctxStr = Object.keys(sanitizedContext).length
            ? ` ${COLORS.dim}▸ [${JSON.stringify(sanitizedContext)}]${COLORS.reset}`
            : ''

        // Збираємо основний рядок
        let logLine = `${timeTag} ${levelTag}: ${COLORS.cyan}${message}${COLORS.reset} \n${ctxStr}`

        // Якщо є додаткові дані (об'єкти, масиви)
        if (data && (Object.keys(data).length > 0 || Array.isArray(data))) {
            // Очищуємо дані перед виводом
            const cleanData = sanitize(data)

            // util.inspect робить об'єкт кольоровим та читабельним
            const formattedData = util.inspect(cleanData, {
                colors: true, // Вмикаємо підсвітку ключів/значень
                depth: 5, // Глибина вкладеності
                breakLength: 80, // Автоперенос рядків
                compact: false, // Робить об'єкт більш розгорнутим і читабельним
            })

            logLine += `\n${formattedData}`
        }

        // Вивід у стандартний потік
        process.stdout.write(logLine + '\n')
    }
}
