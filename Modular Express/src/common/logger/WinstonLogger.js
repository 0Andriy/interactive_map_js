import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import util from 'util'
import path from 'path'
import { AbstractLogger } from './AbstractLogger.js'
import { sanitize } from '../utils/sanitize.js'

/**
 * Нативний формат Winston для очищення даних
 */
const sanitizeFormat = winston.format((info) => {
    return sanitize(info)
})

export class WinstonLogger extends AbstractLogger {
    constructor(level, staticContext = {}) {
        super(level, staticContext)

        // Визначаємо базовий шлях до логів від кореня проєкту
        const LOGS_ROOT = path.resolve(process.cwd(), 'logs')

        // Формат для файлів (чистий JSON для моніторингу)
        const fileFormat = winston.format.combine(
            winston.format.timestamp(),
            winston.format((info) => sanitize(info))(),
            winston.format.json(),
        )

        this.winston = winston.createLogger({
            level: level,
            // Перехоплюємо критичні помилки, які "кладуть" процес
            handleExceptions: true,
            handleRejections: true,
            transports: [
                // 1. Консоль: Кольорова та читабельна
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.colorize(), // Додає кольори до рівнів
                        winston.format.timestamp(),
                        winston.format.printf((info) => {
                            const { timestamp, level, message, ...meta } = info

                            // Очищуємо метадані (контекст + data) через нашу утиліту
                            const cleanMeta = sanitize(meta)

                            // Формуємо рядок, аналогічний ConsoleLogger
                            let out = `[${timestamp}] ${level}: ${message}`

                            if (Object.keys(cleanMeta).length > 0) {
                                out += `\n${util.inspect(cleanMeta, {
                                    colors: true,
                                    depth: 5,
                                    breakLength: 80,
                                })}`
                            }
                            return out
                        }),
                    ),
                }),

                // new winston.transports.File({
                //     filename: 'logs/readable.log',
                //     format: winston.format.combine(
                //         winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                //         winston.format.printf(
                //             (info) =>
                //                 `[${info.timestamp}] ${info.level}: ${info.message} ${JSON.stringify(sanitize(info.meta || {}))}`,
                //         ),
                //     ),
                // }),

                // 2. ЗАГАЛЬНІ ЛОГИ (Ротація: кожен день новий файл)
                new DailyRotateFile({
                    dirname: path.join(LOGS_ROOT, 'combined'), // logs/combined
                    filename: 'application-%DATE%.log',
                    datePattern: 'YYYY-MM-DD',
                    maxFiles: '14d', // Зберігати логи за останні 14 днів
                    maxSize: '20m', // Максимальний розмір одного файлу
                    format: fileFormat,
                    createSymlink: true, // Створює посилання application-current.log
                    symlinkName: 'current.log',
                }),

                // 3. ТІЛЬКИ ПОМИЛКИ (В окрему підпапку)
                new DailyRotateFile({
                    level: 'error',
                    dirname: path.join(LOGS_ROOT, 'errors'), // logs/errors
                    filename: 'error-%DATE%.log',
                    datePattern: 'YYYY-MM-DD',
                    maxFiles: '30d', // Помилки зберігаємо довше (місяць)
                    format: fileFormat,
                }),
            ],
            // Якщо Winston впаде сам, він не зупинить додаток
            exitOnError: false,
        })
    }

    log(level, message, data = {}) {
        // if (this.levels[level] > this.levels[this.level]) return

        // Отримуємо динамічний контекст (requestId, user) з AsyncLocalStorage
        const context = this._getContext()

        // Передаємо в Winston. Він автоматично об'єднає message, context та data
        this.winston.log(level, message, { ...context, ...data })
    }
}
